import * as ts from 'typescript';
import ttypescript from 'ttypescript';
import * as path from 'path';

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
	let parsedConfig: ts.ParsedCommandLine;
	let configFilePath: string | null = null;
	if (
		parsedCommandLine.fileNames?.length &&
		!parsedCommandLine.options.build
	) {
		parsedConfig = updateConfig(parsedCommandLine);
	} else {
		const project = parsedCommandLine.options.build
			? parsedCommandLine.fileNames && parsedCommandLine.fileNames[0]
			: parsedCommandLine.options.project;
		configFilePath = ts.findConfigFile(
			project || tempCompilerHost.getCurrentDirectory(),
			tempCompilerHost.fileExists
		) as any;
		if (!configFilePath) {
			console.error('Config file not found');
			return ts.sys.exit(1);
		}
		configFilePath = path.resolve(configFilePath);
		parsedConfig = getParsedConfig(
			configFilePath,
			parsedCommandLine.options,
			tempCompilerHost
		) as any;
	}

	if (!parsedConfig) {
		console.error('Failed to parse config');
		return ts.sys.exit(1);
	}

	if (parsedCommandLine.options.build && configFilePath) {
		buildProject(configFilePath, parsedConfig);
	} else {
		compileProject(configFilePath, parsedConfig);
	}
}

function buildProject(configFilePath: string, config: ts.ParsedCommandLine) {
	if (config.options.watch) {
		watchBuild(configFilePath, config);
	} else {
		build(configFilePath, config);
	}
}

function createLightWeightProgram(config) {
	const originalCreateBuilderProgram =
		ttypescript.createEmitAndSemanticDiagnosticsBuilderProgram;
	return (...args) => {
		const builderProgram = originalCreateBuilderProgram.apply(
			ttypescript,
			args as any
		);
		builderProgram.getSemanticDiagnostics = () => [];
		if (config.options.noLib) {
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
		}
		return builderProgram;
	};
}

function watchBuild(configFilePath, config: ts.ParsedCommandLine) {
	const solutionBuilderHost = ttypescript.createSolutionBuilderWithWatchHost(
		ts.sys,
		createLightWeightProgram(config)
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
		createLightWeightProgram(config)
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

function compileProject(
	configFilePath: string | null,
	config: ts.ParsedCommandLine
) {
	if (config.options.watch) {
		watchCompile(configFilePath, config);
	} else {
		compile(config);
	}
}

function watchCompile(configFilePath, config: ts.ParsedCommandLine) {
	const host = ttypescript.createWatchCompilerHost(
		configFilePath ? configFilePath : config.fileNames,
		config.options,
		ts.sys,
		createLightWeightProgram(config)
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
		...(config.options.noLib ? [] : program.getGlobalDiagnostics()),
	];
	handleDiagnostics(diagnostics, compilerHost, config.options);

	const result = program.emit();
	if (!config.options.noLib) {
		handleDiagnostics(result.diagnostics, compilerHost, config.options);
	}
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

	return updateConfig(parsedConfig);
}

function updateConfig(config: ts.ParsedCommandLine) {
	for (const [key, value] of Object.entries(EXTRA_OPTIONS)) {
		config.options[key] = value;
	}
	if (
		!(
			config.options.declaration ||
			config.options.emitDeclarationOnly ||
			config.options.composite
		)
	) {
		config.options.noLib = true;
		config.options.lib = undefined;
	}
	return config;
}
