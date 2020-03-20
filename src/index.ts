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
	compilerHost = ttypescript.createCompilerHost(parsedConfig.options);

	if (parsedCommandLine.options.build) {
		build(configFilePath, parsedConfig);
	} else {
		compileProject(configFilePath, parsedConfig);
	}
}

function build(configFilePath, config: ts.ParsedCommandLine) {
	//todo
}

function compileProject(configFilePath, config: ts.ParsedCommandLine) {
	if (config.options.watch) {
		watchCompile(configFilePath, config);
	} else {
		compile(config);
	}
}

function watchCompile(configFilePath, config: ts.ParsedCommandLine) {
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
		config.options,
		ts.sys,
		createBuilderProgram
	);
	ttypescript.createWatchProgram(host);
}

function compile(config: ts.ParsedCommandLine) {
	const compilerHost = createCompilerHost(config);
	const program = createProgram(config, compilerHost);
	const diagnostics = [
		...program.getSyntacticDiagnostics(),
		...program.getOptionsDiagnostics(),
		...program.getConfigFileParsingDiagnostics(),
	];
	handleDiagnostics(diagnostics, compilerHost, config.options);

	program.emit();
}

function createCompilerHost(config: ts.ParsedCommandLine) {
	if (config.options.incremental) {
		return ts.createIncrementalCompilerHost(config.options);
	} else {
		return ts.createCompilerHost(config.options);
	}
}

function createProgram(
	config: ts.ParsedCommandLine,
	compilerHost: ts.CompilerHost
) {
	if (config.options.incremental) {
		return ttypescript.createIncrementalProgram({
			rootNames: config.fileNames,
			options: config.options,
			host: compilerHost,
			projectReferences: config.projectReferences,
			configFileParsingDiagnostics: config.errors,
		});
	} else {
		return ttypescript.createProgram(
			config.fileNames,
			config.options,
			compilerHost
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
