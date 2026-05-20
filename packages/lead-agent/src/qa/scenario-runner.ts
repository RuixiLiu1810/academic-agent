import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactRef } from "@mariozechner/pi-agent-contracts";
import type { SessionManager } from "@mariozechner/pi-agent-host";
import {
	createLeadAgentRuntime,
	type LeadAgentResult,
	type LeadAgentRunEvent,
	type LeadAgentRuntime,
	type LeadAgentRuntimeOptions,
	type LeadAgentTaskRequest,
} from "../index.js";
import {
	buildLeadConversationContext,
	createLeadTaskPlanningInput,
	type LeadConversationContext,
} from "../orchestration/index.js";

export interface ScenarioRunDefinition {
	input: string;
	requestOptions?: ScenarioRequestOptions;
}

export interface ScenarioDefinition {
	id: string;
	title: string;
	input?: string;
	runs?: ScenarioRunDefinition[];
	requestOptions?: ScenarioRequestOptions;
	setup?: ScenarioSetup;
	expect?: ScenarioExpect;
}

export interface ScenarioRequestOptions {
	dispatchMode?: LeadAgentTaskRequest["dispatchMode"];
	profileId?: string;
	taskType?: LeadAgentTaskRequest["taskType"];
	expectedOutputs?: string[];
	acceptanceCriteria?: string[];
}

export interface ScenarioSetup {
	mockWorker?: string;
	mockProvider?: string;
}

export interface ScenarioExpect {
	mode?: "direct" | "workflow" | "worker";
	profiles?: {
		include?: string[];
		includeAny?: string[];
		exclude?: string[];
	};
	tools?: {
		include?: string[];
	};
	artifacts?: {
		includeKinds?: string[];
	};
	events?: {
		include?: string[];
		includeOrdered?: string[];
	};
	finalOutput?: {
		mustInclude?: string[];
		mustIncludeAny?: string[];
		mustNotInclude?: string[];
		mustNotEqualRawWorkerSummary?: boolean;
	};
	trace?: {
		structuredOutputsInclude?: string[];
	};
	memory?: {
		availableArtifactRefsIncludePreviousRun?: boolean;
	};
	session?: {
		noDuplicateUserAssistantMessages?: boolean;
	};
}

export interface ScenarioRunTrace {
	index: number;
	input: string;
	result: LeadAgentResult;
	events: LeadAgentRunEvent[];
	context: LeadConversationContext;
	availableArtifactRefs: ArtifactRef[];
	sessionMessageCounts: {
		user: number;
		assistant: number;
	};
}

export interface ScenarioTrace {
	scenarioId: string;
	title: string;
	runs: ScenarioRunTrace[];
}

export interface RunScenarioOptions {
	runtimeFactory?: (scenario: ScenarioDefinition) => LeadAgentRuntime;
	runtimeOptions?: LeadAgentRuntimeOptions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArrayFrom(value: unknown): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : undefined;
}

function requestOptionsFrom(value: unknown): ScenarioRequestOptions | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const options: ScenarioRequestOptions = {};
	if (value.dispatchMode === "auto" || value.dispatchMode === "direct" || value.dispatchMode === "worker") {
		options.dispatchMode = value.dispatchMode;
	}
	if (typeof value.profileId === "string") {
		options.profileId = value.profileId;
	}
	if (
		value.taskType === "writing" ||
		value.taskType === "research" ||
		value.taskType === "review" ||
		value.taskType === "revision" ||
		value.taskType === "methods" ||
		value.taskType === "citation"
	) {
		options.taskType = value.taskType;
	}
	const expectedOutputs = stringArrayFrom(value.expectedOutputs);
	if (expectedOutputs) {
		options.expectedOutputs = expectedOutputs;
	}
	const acceptanceCriteria = stringArrayFrom(value.acceptanceCriteria);
	if (acceptanceCriteria) {
		options.acceptanceCriteria = acceptanceCriteria;
	}
	return Object.keys(options).length > 0 ? options : undefined;
}

function setupFrom(value: unknown): ScenarioSetup | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const setup: ScenarioSetup = {};
	if (typeof value.mockWorker === "string") {
		setup.mockWorker = value.mockWorker;
	}
	if (typeof value.mockProvider === "string") {
		setup.mockProvider = value.mockProvider;
	}
	return Object.keys(setup).length > 0 ? setup : undefined;
}

function expectationFrom(value: unknown): ScenarioExpect | undefined {
	return isRecord(value) ? (value as unknown as ScenarioExpect) : undefined;
}

function runDefinitionsFrom(value: unknown): ScenarioRunDefinition[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const runs: ScenarioRunDefinition[] = [];
	for (const run of value) {
		if (!isRecord(run) || typeof run.input !== "string") {
			continue;
		}
		runs.push({
			input: run.input,
			requestOptions: requestOptionsFrom(run.requestOptions),
		});
	}
	return runs.length > 0 ? runs : undefined;
}

function scenarioFromJson(value: unknown, source: string): ScenarioDefinition {
	if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
		throw new Error(`Invalid scenario file: ${source}`);
	}
	const input = typeof value.input === "string" ? value.input : undefined;
	const runs = runDefinitionsFrom(value.runs);
	if (!input && !runs) {
		throw new Error(`Scenario ${value.id} must define input or runs`);
	}
	return {
		id: value.id,
		title: value.title,
		...(input ? { input } : {}),
		...(runs ? { runs } : {}),
		requestOptions: requestOptionsFrom(value.requestOptions),
		setup: setupFrom(value.setup),
		expect: expectationFrom(value.expect),
	};
}

export function loadScenarioBank(dir: string): ScenarioDefinition[] {
	if (!existsSync(dir)) {
		return [];
	}
	return readdirSync(dir)
		.filter((filename) => filename.endsWith(".json"))
		.sort()
		.map((filename) => {
			const path = join(dir, filename);
			return scenarioFromJson(JSON.parse(readFileSync(path, "utf8")) as unknown, path);
		})
		.sort((left, right) => left.id.localeCompare(right.id));
}

function scenarioRuns(scenario: ScenarioDefinition): ScenarioRunDefinition[] {
	if (scenario.runs && scenario.runs.length > 0) {
		return scenario.runs;
	}
	return [
		{
			input: scenario.input ?? "",
			requestOptions: scenario.requestOptions,
		},
	];
}

function countMessages(sessionManager: SessionManager): { user: number; assistant: number } {
	let user = 0;
	let assistant = 0;
	for (const entry of sessionManager.getEntries()) {
		if (entry.type !== "message") {
			continue;
		}
		if (entry.message.role === "user") {
			user += 1;
		} else if (entry.message.role === "assistant") {
			assistant += 1;
		}
	}
	return { user, assistant };
}

export async function runScenario(
	scenario: ScenarioDefinition,
	options: RunScenarioOptions = {},
): Promise<ScenarioTrace> {
	const runtime = options.runtimeFactory?.(scenario) ?? createLeadAgentRuntime(options.runtimeOptions);
	const runs: ScenarioRunTrace[] = [];
	for (const [index, run] of scenarioRuns(scenario).entries()) {
		const events: LeadAgentRunEvent[] = [];
		const requestOptions = {
			...(scenario.requestOptions ?? {}),
			...(run.requestOptions ?? {}),
		};
		const taskId = `${scenario.id}:run-${index + 1}`;
		const result = await runtime.run({
			...requestOptions,
			taskId,
			objective: run.input,
			onEvent: (event) => events.push(event),
		});
		const context = buildLeadConversationContext({
			sessionManager: runtime.sessionManager,
			currentObjective: run.input,
		});
		const planningInput = createLeadTaskPlanningInput({
			request: {
				...requestOptions,
				taskId,
				objective: run.input,
			},
			taskId,
			sessionId: runtime.sessionManager.getSessionId(),
			profiles: runtime.profiles,
			conversationContext: context,
		});
		runs.push({
			index,
			input: run.input,
			result,
			events,
			context,
			availableArtifactRefs: planningInput.availableArtifactRefs,
			sessionMessageCounts: countMessages(runtime.sessionManager),
		});
	}
	return {
		scenarioId: scenario.id,
		title: scenario.title,
		runs,
	};
}
