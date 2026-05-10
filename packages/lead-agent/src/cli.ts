#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
	createLeadAgentRuntime,
	type LeadAgentTaskRequest,
	type LeadAgentWorkerRunner,
	loadAcademicProfilesFromDir,
} from "./index.js";

interface CliOptions {
	objectiveParts: string[];
	constraints: string[];
	expectedOutputs: string[];
	acceptanceCriteria: string[];
	profileDir?: string;
	cwd?: string;
	json: boolean;
	directOnly: boolean;
	help: boolean;
}

function usage(): string {
	return `Usage: ./lead-agent-test.sh [options] <academic task>

Options:
  --constraint <text>          Add a task constraint
  --expected-output <text>     Add an expected worker output
  --acceptance <text>          Add an acceptance criterion
  --profile-dir <path>         Load academic profiles from a Markdown directory
  --cwd <path>                 Working directory for the lead session
  --direct                     Disable worker dispatch for a direct lead-agent run
  --json                       Print the full LeadAgentResult as JSON
  --help                       Show this help

If no task argument is provided, the task is read from stdin.`;
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
		objectiveParts: [],
		constraints: [],
		expectedOutputs: [],
		acceptanceCriteria: [],
		json: false,
		directOnly: false,
		help: false,
	};
	for (let index = 0; index < args.length; index++) {
		const arg = args[index]!;
		switch (arg) {
			case "--constraint":
				options.constraints.push(readOptionValue(args, index, arg));
				index++;
				break;
			case "--expected-output":
				options.expectedOutputs.push(readOptionValue(args, index, arg));
				index++;
				break;
			case "--acceptance":
				options.acceptanceCriteria.push(readOptionValue(args, index, arg));
				index++;
				break;
			case "--profile-dir":
				options.profileDir = readOptionValue(args, index, arg);
				index++;
				break;
			case "--cwd":
				options.cwd = readOptionValue(args, index, arg);
				index++;
				break;
			case "--json":
				options.json = true;
				break;
			case "--direct":
				options.directOnly = true;
				break;
			case "--help":
			case "-h":
				options.help = true;
				break;
			default:
				options.objectiveParts.push(arg);
				break;
		}
	}
	return options;
}

function readObjective(options: CliOptions): string {
	const objective = options.objectiveParts.join(" ").trim();
	if (objective.length > 0) {
		return objective;
	}
	if (process.stdin.isTTY) {
		return "";
	}
	return readFileSync(0, "utf8").trim();
}

function createFailingWorkerRunner(): LeadAgentWorkerRunner {
	return async (request) => ({
		taskId: request.taskId,
		status: "failed",
		summary: "Worker dispatch was disabled by --direct.",
		producedArtifacts: [],
		warnings: ["Worker dispatch disabled."],
		openQuestions: [],
		executionTrace: {
			runId: `direct-disabled-${request.taskId}`,
			startedAt: new Date().toISOString(),
			events: [],
		},
		failureReason: "direct_only",
	});
}

function taskRequestFromOptions(objective: string, options: CliOptions): LeadAgentTaskRequest {
	return {
		objective,
		constraints: options.constraints.length > 0 ? options.constraints : undefined,
		expectedOutputs: options.expectedOutputs.length > 0 ? options.expectedOutputs : undefined,
		acceptanceCriteria: options.acceptanceCriteria.length > 0 ? options.acceptanceCriteria : undefined,
	};
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(usage());
		return;
	}
	const objective = readObjective(options);
	if (objective.length === 0) {
		console.error(usage());
		process.exitCode = 1;
		return;
	}
	const profiles = options.directOnly
		? []
		: options.profileDir
			? loadAcademicProfilesFromDir(options.profileDir)
			: undefined;
	const runtime = createLeadAgentRuntime({
		cwd: options.cwd,
		profiles,
		workerRunner: options.directOnly ? createFailingWorkerRunner() : undefined,
	});
	const result = await runtime.run(taskRequestFromOptions(objective, options));
	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}
	console.log(result.finalOutput);
	console.log("");
	console.log(`decision: ${result.decision.mode}${result.decision.profileId ? `/${result.decision.profileId}` : ""}`);
	if (result.acceptanceReport) {
		console.log(`accepted: ${result.acceptanceReport.accepted ? "yes" : "no"}`);
		for (const issue of result.acceptanceReport.issues) {
			console.log(`${issue.severity}: ${issue.code}: ${issue.message}`);
		}
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
});
