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
				handleDiagnostics([d], compilerHost, parsedCommandLine);
			},
		}
	);
	if (!parsedConfig) {
		console.error('Failed to parse config');
		return ts.sys.exit(1);
	}
	const program = ttypescript.createProgram(
		parsedConfig!.fileNames,
		parsedConfig!.options,
		compilerHost
	);
	const diagnostics = program.getSyntacticDiagnostics();
	handleDiagnostics(diagnostics, compilerHost, parsedConfig);

	const result = program.emit();
	handleDiagnostics(result.diagnostics, compilerHost, parsedConfig);
}

function handleDiagnostics(
	diagnostics: ReadonlyArray<ts.Diagnostic>,
	host: ts.CompilerHost,
	config: ts.ParsedCommandLine
) {
	if (diagnostics.length) {
		console.error(formatDiagnostics(diagnostics, host, config));
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

function formatDiagnostics(
	d: ReadonlyArray<ts.Diagnostic>,
	host: ts.CompilerHost,
	config: ts.ParsedCommandLine
) {
	if (shouldBePretty(config.options)) {
		return ts.formatDiagnosticsWithColorAndContext(d, {
			getCanonicalFileName(fileName) {
				return host.getCanonicalFileName(fileName);
			},
			getCurrentDirectory() {
				return host.getCurrentDirectory();
			},
			getNewLine() {
				return host.getNewLine();
			},
		});
	} else {
		return ts.formatDiagnostics(d, {
			getCanonicalFileName(fileName) {
				return host.getCanonicalFileName(fileName);
			},
			getCurrentDirectory() {
				return host.getCurrentDirectory();
			},
			getNewLine() {
				return host.getNewLine();
			},
		});
	}
}
