#!/usr/bin/env node
import { runAcademicSmokeSuite } from "./academic-smoke.js";

interface CliOptions {
	artifactDir?: string;
	json: boolean;
	help: boolean;
}

function usage(): string {
	return `Usage: ./academic-smoke-test.sh [options]

Options:
  --artifact-dir <path>   Persist smoke artifacts and manifest to this directory
  --json                  Print the full smoke suite result as JSON
  --help                  Show this help`;
}

function readOptionValue(args: string[], index: number, optionName: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${optionName} requires a value`);
	}
	return value;
}

function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = {
		json: false,
		help: false,
	};
	for (let index = 0; index < args.length; index++) {
		const arg = args[index]!;
		switch (arg) {
			case "--artifact-dir":
				options.artifactDir = readOptionValue(args, index, arg);
				index++;
				break;
			case "--json":
				options.json = true;
				break;
			case "--help":
			case "-h":
				options.help = true;
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}
	return options;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(usage());
		return;
	}
	const result = await runAcademicSmokeSuite({
		artifactDir: options.artifactDir,
	});
	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		for (const caseResult of result.results) {
			console.log(`${caseResult.passed ? "PASS" : "FAIL"} ${caseResult.caseId}`);
			for (const failure of caseResult.failures) {
				console.log(`  - ${failure}`);
			}
		}
		console.log(`artifacts: ${result.artifactRefs.length}`);
		if (result.manifestPath) {
			console.log(`manifest: ${result.manifestPath}`);
		}
	}
	if (!result.passed) {
		process.exitCode = 1;
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
});
