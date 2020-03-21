import * as ts from 'typescript';
import ttypescript from 'ttypescript';

const EXTRA_OPTIONS: ts.CompilerOptions = {
	skipLibCheck: true,
	noResolve: true,
	types: [],
	noEmitOnError: false,
};

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

	const parsedConfig = getParsedConfig(
		configFilePath,
		parsedCommandLine.options,
		tempCompilerHost
	);
	if (!parsedConfig) {
		console.error('Failed to parse config');
		return ts.sys.exit(1);
	}

	if (parsedCommandLine.options.build) {
		buildProject(configFilePath, parsedConfig);
	} else {
		compileProject(configFilePath, parsedConfig);
	}
}

function buildProject(configFilePath, config: ts.ParsedCommandLine) {
	if (config.options.watch) {
		watchBuild(configFilePath, config);
	} else {
		build(configFilePath, config);
	}
}

function createLightWeightProgram() {
	const originalCreateBuilderProgram =
		ttypescript.createEmitAndSemanticDiagnosticsBuilderProgram;
	return (...args) => {
		const builderProgram = originalCreateBuilderProgram.apply(
			ttypescript,
			args as any
		);
		builderProgram.getSemanticDiagnostics = () => [];
		return builderProgram;
	};
}

function watchBuild(configFilePath, config: ts.ParsedCommandLine) {
	const solutionBuilderHost = ttypescript.createSolutionBuilderWithWatchHost(
		ts.sys,
		createLightWeightProgram()
	);
	const compilerHost = createCompilerHost(config);

	solutionBuilderHost.getParsedCommandLine = configFilePath => {
		return getParsedConfig(configFilePath, {}, compilerHost);
	};

	const solutionBuilderWatch = ttypescript.createSolutionBuilderWithWatch(
		solutionBuilderHost,
		[configFilePath],
		{
			incremental: config.options.incremental,
		}
	);
	solutionBuilderWatch.build(configFilePath);
}

function build(configFilePath, config: ts.ParsedCommandLine) {
	const solutionBuilderHost = ttypescript.createSolutionBuilderHost(
		ts.sys,
		createLightWeightProgram()
	);
	const compilerHost = createCompilerHost(config);

	solutionBuilderHost.getParsedCommandLine = configFilePath => {
		return getParsedConfig(configFilePath, {}, compilerHost);
	};

	const solutionBuilder = ttypescript.createSolutionBuilder(
		solutionBuilderHost,
		[configFilePath],
		{
			incremental: config.options.incremental,
		}
	);
	solutionBuilder.build(configFilePath);
}

function compileProject(configFilePath, config: ts.ParsedCommandLine) {
	if (config.options.watch) {
		watchCompile(configFilePath, config);
	} else {
		compile(config);
	}
}

function watchCompile(configFilePath, config: ts.ParsedCommandLine) {
	const host = ttypescript.createWatchCompilerHost(
		configFilePath,
		config.options,
		ts.sys,
		createLightWeightProgram()
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
		...program.getGlobalDiagnostics(),
	];
	handleDiagnostics(diagnostics, compilerHost, config.options);

	const result = program.emit();
	handleDiagnostics(result.diagnostics, compilerHost, config.options);
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

function getParsedConfig(configFilePath, extraOptions, compilerHost) {
	const parsedConfig = ts.getParsedCommandLineOfConfigFile(
		configFilePath as string,
		extraOptions,
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic(d) {
				handleDiagnostics([d], compilerHost, parsedConfig!.options);
			},
		}
	);
	if (!parsedConfig) {
		return parsedConfig;
	}
	for (const [key, value] of Object.entries(EXTRA_OPTIONS)) {
		parsedConfig.options[key] = value;
	}
	return parsedConfig;
}
