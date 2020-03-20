import * as ts from 'typescript';
import ttypescript from 'ttypescript';

export function transpile() {
	const commandLine = ts.sys.args;
	const parsedCommandLine = ts.parseCommandLine(commandLine);
	const tempCompilerHost = ts.createCompilerHost({});
	const configFilePath = ts.findConfigFile(
		parsedCommandLine.options.project ||
			tempCompilerHost.getCurrentDirectory(),
		tempCompilerHost.fileExists
	);
	if (!configFilePath) {
		console.error('Config file not found');
		return ts.sys.exit(1);
	}

	let compilerHost: ts.CompilerHost = tempCompilerHost;

	const parsedConfig = ts.getParsedCommandLineOfConfigFile(
		configFilePath as string,
		parsedCommandLine.options,
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic(d) {
				handleDiagnostics([d], compilerHost, parsedConfig!.options);
			},
		}
	);
	if (!parsedConfig) {
		console.error('Failed to parse config');
		return ts.sys.exit(1);
	}
	parsedConfig.options = {
		...parsedConfig.options,
		skipLibCheck: true,
		noResolve: true,
		types: [],
		noLib: true,
	};
	compilerHost = ts.createCompilerHost(parsedConfig.options);

	if (parsedCommandLine.options.watch) {
		const originalCreateBuilderProgram = ttypescript.createAbstractBuilder;

		const createBuilderProgram = (...args) => {
			const builderProgram = originalCreateBuilderProgram.apply(
				ttypescript,
				args as any
			);
			builderProgram.getSemanticDiagnostics = () => [];
			builderProgram.getGlobalDiagnostics = () => [];
			const originalEmit = builderProgram.emit;
			builderProgram.emit = (...args) => {
				const result = originalEmit.apply(builderProgram, args);

				return {
					diagnostics: [],
					emitSkipped: result.emitSkipped,
					emittedFiles: result.emittedFiles,
				};
			};
			return builderProgram;
		};
		const host = ttypescript.createWatchCompilerHost(
			configFilePath,
			parsedConfig.options,
			ts.sys,
			createBuilderProgram
		);
		ttypescript.createWatchProgram(host);
	} else {
		const program = ttypescript.createProgram(
			parsedConfig!.fileNames,
			parsedConfig!.options,
			compilerHost
		);
		const diagnostics = program.getSyntacticDiagnostics();
		handleDiagnostics(diagnostics, compilerHost, parsedConfig!.options);

		program.emit();
	}
}

function handleDiagnostics(
	diagnostics: ReadonlyArray<ts.Diagnostic>,
	host: ts.CompilerHost,
	options: ts.CompilerOptions
) {
	if (diagnostics.length) {
		if (shouldBePretty(options)) {
			console.error(
				ts.formatDiagnosticsWithColorAndContext(diagnostics, host)
			);
		} else {
			console.error(ts.formatDiagnostics(diagnostics, host));
		}
		ts.sys.exit(1);
	}
}

function shouldBePretty(options?: ts.CompilerOptions) {
	if (!options || typeof options.pretty === 'undefined') {
		return defaultIsPretty();
	}
	return options.pretty;
	function defaultIsPretty() {
		return !!ts.sys.writeOutputIsTTY && ts.sys.writeOutputIsTTY();
	}
}
