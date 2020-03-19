import * as ts from 'typescript';
import ttypescript from 'ttypescript';

export function transpile() {
	const commandLine = ts.sys.args;
	const parsedCommandLine = ts.parseCommandLine(commandLine);
	const compilerHost = ts.createCompilerHost(parsedCommandLine.options);
	const configFilePath = ts.findConfigFile(
		parsedCommandLine.options.project || compilerHost.getCurrentDirectory(),
		compilerHost.fileExists
	);
	if (!configFilePath) {
		console.error('Config file not found');
		return ts.sys.exit(1);
	}

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
	if (parsedCommandLine.options.watch) {
		const originalCreateBuilderProgram = ttypescript.createAbstractBuilder;

		const createBuilderProgram = (...args) => {
			const builderProgram = originalCreateBuilderProgram.apply(
				ttypescript,
				args as any
			);
			builderProgram.getSemanticDiagnostics = () => [];
			return builderProgram;
		};
		const host = ttypescript.createWatchCompilerHost(
			configFilePath,
			parsedCommandLine.options,
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

		const result = program.emit();
		handleDiagnostics(
			result.diagnostics,
			compilerHost,
			parsedConfig!.options
		);
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
