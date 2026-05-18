import { stdin as processStdin, stdout as processStdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { createLeadAgentRunView, renderLeadAgentMarkdown } from "../cli/output.js";
import type { AcademicTaskType, LeadAgentModel, LeadAgentRuntime, ThinkingLevel } from "../index.js";

export interface RunLeadInteractiveLoopOptions {
	runtime: LeadAgentRuntime;
	inputs?: string[];
	stdout?: (text: string) => void;
	stderr?: (text: string) => void;
	defaultTaskType?: AcademicTaskType;
	defaultProfileId?: string;
	defaultExpectedOutputs?: string[];
	model?: LeadAgentModel;
	thinkingLevel?: ThinkingLevel;
}

interface InteractiveState {
	taskType?: AcademicTaskType;
	profileId?: string;
	expectedOutputs: string[];
	model?: LeadAgentModel;
	thinkingLevel?: ThinkingLevel;
}

function parseAcademicTaskType(value: string): AcademicTaskType | undefined {
	if (
		value === "writing" ||
		value === "research" ||
		value === "review" ||
		value === "revision" ||
		value === "methods" ||
		value === "citation"
	) {
		return value;
	}
	return undefined;
}

function renderSettings(state: InteractiveState, sessionId: string): string {
	return [
		`settings:`,
		`session:          ${sessionId}`,
		`task-type:        ${state.taskType ?? "auto"}`,
		`profile:          ${state.profileId ?? "auto"}`,
		`expected-outputs: ${state.expectedOutputs.length > 0 ? state.expectedOutputs.join(", ") : "none"}`,
		`model:            ${state.model ? `${state.model.provider}/${state.model.id}` : "default"}`,
		`thinking:         ${state.thinkingLevel ?? "default"}`,
	].join("\n");
}

function handleCommand(line: string, state: InteractiveState, stdout: (text: string) => void): boolean {
	const [command, ...parts] = line.slice(1).trim().split(/\s+/);
	const value = parts.join(" ").trim();
	if (command === "help") {
		stdout("/settings\n/task-type <type>\n/profile <id>\n/expected-output <text>\n/session\n/exit\n");
		return true;
	}
	if (command === "task-type") {
		const taskType = parseAcademicTaskType(value);
		if (taskType) {
			state.taskType = taskType;
			stdout(`task-type: ${taskType}\n`);
		} else {
			stdout("task-type must be writing, research, review, revision, methods, or citation\n");
		}
		return true;
	}
	if (command === "profile") {
		state.profileId = value || undefined;
		stdout(`profile: ${state.profileId ?? "auto"}\n`);
		return true;
	}
	if (command === "expected-output") {
		if (value.length > 0) {
			state.expectedOutputs = [value];
		}
		stdout(`expected-output: ${state.expectedOutputs.join(", ") || "none"}\n`);
		return true;
	}
	return false;
}

async function collectInputs(options: RunLeadInteractiveLoopOptions): Promise<string[]> {
	if (options.inputs) {
		return options.inputs;
	}
	const rl = createInterface({ input: processStdin, output: processStdout });
	const lines: string[] = [];
	while (true) {
		const line = await rl.question("lead> ");
		lines.push(line);
		if (line.trim() === "/exit") {
			break;
		}
	}
	rl.close();
	return lines;
}

export async function runLeadInteractiveLoop(options: RunLeadInteractiveLoopOptions): Promise<number> {
	const stdout = options.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = options.stderr ?? ((text: string) => process.stderr.write(text));
	const state: InteractiveState = {
		taskType: options.defaultTaskType,
		profileId: options.defaultProfileId,
		expectedOutputs: options.defaultExpectedOutputs ?? [],
		model: options.model,
		thinkingLevel: options.thinkingLevel,
	};
	const inputs = await collectInputs(options);
	for (const rawLine of inputs) {
		const line = rawLine.trim();
		if (line.length === 0) {
			continue;
		}
		if (line === "/exit") {
			stdout("bye\n");
			return 0;
		}
		if (line.startsWith("/")) {
			if (line === "/settings" || line === "/setting") {
				stdout(`${renderSettings(state, options.runtime.sessionManager.getSessionId())}\n`);
				continue;
			}
			const handled = handleCommand(line, state, stdout);
			if (!handled && line === "/session") {
				stdout(`session: ${options.runtime.sessionManager.getSessionId()}\n`);
			} else if (!handled) {
				stderr(`Unknown command: ${line}\n`);
			}
			continue;
		}
		const result = await options.runtime.run({
			objective: line,
			taskType: state.taskType,
			profileId: state.profileId,
			expectedOutputs: state.expectedOutputs.length > 0 ? state.expectedOutputs : undefined,
		});
		stdout(renderLeadAgentMarkdown(createLeadAgentRunView(result)));
	}
	return 0;
}
