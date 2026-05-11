import { readFileSync } from "node:fs";
import {
	type AcademicTaskType,
	createLeadAgentRuntime,
	type LeadAgentDirectRunner,
	type LeadAgentDispatchMode,
	type LeadAgentTaskRequest,
	type LeadAgentWorkerRunner,
	loadAcademicProfilesFromDir,
} from "../index.js";
import { runLeadInteractiveLoop } from "../modes/interactive-loop.js";
import { runLeadTuiMode } from "../modes/tui/lead-tui-mode.js";
import { type LeadCliArgs, leadCliHelp, parseLeadCliArgs } from "./args.js";
import { persistLeadCliArtifacts } from "./artifacts.js";
import { fileInputsToMetadata, type LeadCliFileInput, readLeadCliFileInputs } from "./file-input.js";
import { createLeadAgentRunView, renderLeadAgentJson, renderLeadAgentMarkdown } from "./output.js";
import { createLeadCliSessionManager } from "./session.js";

export interface LeadAgentCliIo {
	stdin?: string;
	stdout?: (text: string) => void;
	stderr?: (text: string) => void;
	workerRunner?: LeadAgentWorkerRunner;
	directRunner?: LeadAgentDirectRunner;
}

function readProcessStdin(): string {
	if (process.stdin.isTTY) {
		return "";
	}
	return readFileSync(0, "utf8");
}

function readObjective(objectiveParts: string[], stdin: string | undefined): string {
	const objective = objectiveParts.join(" ").trim();
	if (objective.length > 0) {
		return objective;
	}
	return (stdin ?? readProcessStdin()).trim();
}

function stdinLines(stdin: string | undefined): string[] | undefined {
	return stdin
		?.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function interactiveInputLines(stdin: string | undefined): string[] | undefined {
	if (stdin !== undefined) {
		return stdinLines(stdin);
	}
	if (!process.stdin.isTTY) {
		return stdinLines(readProcessStdin());
	}
	return undefined;
}

function toTaskType(value: string | undefined): AcademicTaskType | undefined {
	if (!value || value === "auto") {
		return undefined;
	}
	return value as AcademicTaskType;
}

function toDispatchMode(value: string | undefined): LeadAgentDispatchMode | undefined {
	if (!value || value === "auto") {
		return undefined;
	}
	return value as LeadAgentDispatchMode;
}

function createTaskRequest(
	objective: string,
	args: LeadCliArgs,
	fileInputs: readonly LeadCliFileInput[],
): LeadAgentTaskRequest {
	const request: LeadAgentTaskRequest = { objective };
	const fileConstraints = fileInputs.map((input) => input.constraint);
	const constraints = [...args.constraints, ...fileConstraints];
	if (constraints.length > 0) {
		request.constraints = constraints;
	}
	if (args.expectedOutputs.length > 0) {
		request.expectedOutputs = args.expectedOutputs;
	}
	if (args.acceptanceCriteria.length > 0) {
		request.acceptanceCriteria = args.acceptanceCriteria;
	}
	const taskType = toTaskType(args.taskType);
	if (taskType) {
		request.taskType = taskType;
	}
	if (args.profileId) {
		request.profileId = args.profileId;
	}
	const dispatchMode = toDispatchMode(args.dispatchMode);
	if (dispatchMode) {
		request.dispatchMode = dispatchMode;
	}
	if (fileInputs.length > 0) {
		request.metadata = fileInputsToMetadata(fileInputs);
	}
	return request;
}

export async function runLeadAgentCli(argv: string[], io: LeadAgentCliIo = {}): Promise<number> {
	const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));
	const args = parseLeadCliArgs(argv);
	if (args.help) {
		stdout(`${leadCliHelp()}\n`);
		return 0;
	}
	if (args.diagnostics.some((diagnostic) => diagnostic.type === "error")) {
		for (const diagnostic of args.diagnostics) {
			stderr(`${diagnostic.type}: ${diagnostic.message}\n`);
		}
		return 1;
	}
	const cwd = args.cwd ?? process.cwd();
	const profiles = args.profileDir ? loadAcademicProfilesFromDir(args.profileDir) : undefined;
	const sessionManager = await createLeadCliSessionManager({
		cwd,
		sessionDir: args.sessionDir,
		noSession: args.noSession,
		continue: args.continue,
		resume: args.resume,
		session: args.session,
		fork: args.fork,
	});
	const runtime = createLeadAgentRuntime({
		cwd,
		profiles,
		sessionManager,
		workerRunner: io.workerRunner,
		directRunner: io.directRunner,
	});
	if (args.appMode === "interactive") {
		if (io.stdin === undefined && process.stdin.isTTY) {
			return runLeadTuiMode({
				runtime,
				initialPrompt: args.objectiveParts.join(" ").trim() || undefined,
			});
		}
		return runLeadInteractiveLoop({
			runtime,
			inputs: interactiveInputLines(io.stdin),
			stdout,
			stderr,
			defaultTaskType: toTaskType(args.taskType),
			defaultProfileId: args.profileId,
			defaultExpectedOutputs: args.expectedOutputs,
		});
	}
	const objective = readObjective(args.objectiveParts, io.stdin);
	if (objective.length === 0) {
		if (process.stdin.isTTY) {
			return runLeadTuiMode({
				runtime,
			});
		}
		stderr(`${leadCliHelp()}\n`);
		return 1;
	}
	const fileInputs = readLeadCliFileInputs(cwd, args.fileArgs);
	const result = await runtime.run(createTaskRequest(objective, args, fileInputs));
	const persisted = args.artifactDir ? persistLeadCliArtifacts(result, args.artifactDir) : undefined;
	const view = createLeadAgentRunView(result, {
		artifactManifestPath: persisted?.manifestPath,
	});
	stdout(args.outputMode === "json" ? renderLeadAgentJson(view) : renderLeadAgentMarkdown(view));
	return result.acceptanceReport && !result.acceptanceReport.accepted ? 2 : 0;
}
