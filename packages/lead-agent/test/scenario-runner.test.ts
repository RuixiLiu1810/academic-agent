import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createExecutionTrace, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { createLeadAgentRuntime, type LeadAgentRunEvent } from "../src/index.js";
import { assertScenarioTrace, collectScenarioIssues } from "../src/qa/scenario-assertions.js";
import { createScenarioCoverageRows } from "../src/qa/scenario-report.js";
import { loadScenarioBank, runScenario, type ScenarioTrace } from "../src/qa/scenario-runner.js";

const scenariosDir = resolve(import.meta.dirname, "../scenarios");
let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-scenario-runner-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function literatureWorker(requestTaskId: string): WorkerResult {
	return {
		taskId: requestTaskId,
		status: "success",
		summary:
			"Raw worker summary: search strategy, bibliography candidates, and retrieval gaps are in literature-search-results artifact lit-scenario-1.",
		structuredOutputs: {
			"search strategy": "NIR sclera search",
			"bibliography candidates": ["candidate"],
			"retrieval gaps": ["provider metadata only"],
		},
		producedArtifacts: [
			{
				id: "lit-scenario-1",
				kind: "literature-search-results",
				uri: "memory://lit-scenario-1",
				title: "Scenario literature search",
			},
		],
		artifactBriefs: [
			{
				artifactId: "lit-scenario-1",
				kind: "literature-search-results",
				title: "Scenario literature search",
				brief: "3 candidate records from mock providers.",
				limitations: ["provider metadata only"],
			},
		],
		warnings: ["provider metadata only"],
		openQuestions: [],
		executionTrace: createExecutionTrace("scenario-literature-worker"),
	};
}

function makeToolEvents(taskId: string): LeadAgentRunEvent[] {
	return [
		{
			type: "tool_call_start",
			taskId,
			profileId: "literature-searcher",
			workerType: "literature-searcher",
			toolCallId: "tool-1",
			toolName: "literature.search",
		},
		{
			type: "tool_call_complete",
			taskId,
			profileId: "literature-searcher",
			workerType: "literature-searcher",
			toolCallId: "tool-1",
			toolName: "literature.search",
			isError: false,
			producedArtifactKinds: ["literature-search-results"],
		},
	];
}

function makeTrace(overrides: Partial<ScenarioTrace> = {}): ScenarioTrace {
	const taskId = "scenario-task";
	return {
		scenarioId: "synthetic",
		title: "Synthetic",
		runs: [
			{
				index: 0,
				input: "帮我找 nir 和巩膜相关的近五年文献",
				result: {
					taskId,
					sessionId: "session-synthetic",
					finalOutput: "Lead-level synthesis\n检索结果 artifact\n- lit-scenario-1 (literature-search-results)",
					decision: {
						mode: "worker",
						workerType: "literature-searcher",
						profileId: "literature-searcher",
						reason: "workflow",
					},
					workflowPlan: {
						taskId,
						sessionId: "session-synthetic",
						objective: "帮我找 nir 和巩膜相关的近五年文献",
						rationale: "workflow",
						userVisibleSummary: "workflow",
						mode: "workflow",
						steps: [
							{
								id: "literature-search",
								order: 1,
								profileId: "literature-searcher",
								objective: "User objective: x\n\nStep objective: y",
								inputArtifactRefs: [],
								expectedArtifactKinds: ["literature-search-results"],
								expectedOutputs: ["bibliography candidates"],
								acceptanceCriteria: [],
							},
						],
						stopConditions: ["accepted"],
					},
				},
				events: [
					{ type: "planner_start", taskId, sessionId: "session-synthetic", objectivePreview: "preview" },
					{
						type: "planner_complete",
						taskId,
						sessionId: "session-synthetic",
						mode: "workflow",
						stepCount: 1,
						stepProfiles: ["literature-searcher"],
						userVisibleSummary: "workflow",
					},
					...makeToolEvents(taskId),
					{
						type: "artifact_created",
						taskId,
						stepId: "literature-search",
						profileId: "literature-searcher",
						artifactId: "lit-scenario-1",
						artifactKind: "literature-search-results",
						title: "Scenario literature search",
					},
					{
						type: "session_memory_updated",
						taskId,
						sessionId: "session-synthetic",
						producedArtifactCount: 1,
						artifactKinds: ["literature-search-results"],
						issueCount: 0,
						hasWorkflowPlanSummary: true,
					},
				],
				context: {
					sessionId: "session-synthetic",
					currentObjective: "x",
					recentUserObjectives: [],
					recentLeadOutputs: [],
					recentDecisions: [],
					recentWorkflowResults: [],
					priorArtifacts: [
						{
							id: "lit-scenario-1",
							kind: "literature-search-results",
							uri: "memory://lit-scenario-1",
						},
					],
					artifactBriefs: [],
					budget: { maxChars: 12000, usedChars: 10, truncatedSections: [] },
				},
				availableArtifactRefs: [
					{
						id: "lit-scenario-1",
						kind: "literature-search-results",
						uri: "memory://lit-scenario-1",
					},
				],
				sessionMessageCounts: { user: 1, assistant: 1 },
			},
		],
		...overrides,
	};
}

describe("lead-agent scenario bank", () => {
	it("loads the first scenario bank with stable ids", () => {
		const scenarios = loadScenarioBank(scenariosDir);

		expect(scenarios.map((scenario) => scenario.id)).toEqual([
			"forced-direct-lifecycle",
			"placeholder-marker-not-leaked",
			"provider-failure-warning",
			"simple-direct-reading-frame",
			"single-step-literature-synthesis",
			"two-run-artifact-continuity",
			"workflow-event-order",
			"zh-literature-search-tool-required",
			"zh-research-review-workflow",
			"zh-search-no-confirmation",
		]);
		expect(createScenarioCoverageRows(scenarios).map((row) => row.id)).toHaveLength(10);
	});

	it("runs a scenario through the runtime and captures events, artifacts, context, and session counts", async () => {
		const scenario = loadScenarioBank(scenariosDir).find((entry) => entry.id === "single-step-literature-synthesis");
		expect(scenario).toBeDefined();
		const trace = await runScenario(scenario!, {
			runtimeFactory: () =>
				createLeadAgentRuntime({
					cwd: makeTempDir(),
					workerRunner: async (request) => literatureWorker(request.taskId),
				}),
		});

		expect(trace.runs[0]?.events.map((event) => event.type)).toContain("artifact_created");
		expect(trace.runs[0]?.context.priorArtifacts.map((artifact) => artifact.id)).toContain("lit-scenario-1");
		expect(trace.runs[0]?.sessionMessageCounts).toEqual({ user: 1, assistant: 1 });
		assertScenarioTrace(scenario!, trace);
	});

	it("tracks prior artifacts across two scenario runs", async () => {
		const scenario = loadScenarioBank(scenariosDir).find((entry) => entry.id === "two-run-artifact-continuity");
		expect(scenario).toBeDefined();
		const cwd = makeTempDir();
		const trace = await runScenario(scenario!, {
			runtimeFactory: () =>
				createLeadAgentRuntime({
					cwd,
					workerRunner: async (request) => literatureWorker(request.taskId),
				}),
		});

		expect(trace.runs).toHaveLength(2);
		expect(trace.runs[1]?.availableArtifactRefs.map((artifact) => artifact.id)).toContain("lit-scenario-1");
		expect(collectScenarioIssues(scenario!, trace)).toEqual([]);
	});

	it("asserts tools, artifacts, events, memory updates, and forbidden final output phrases", () => {
		const scenario = loadScenarioBank(scenariosDir).find(
			(entry) => entry.id === "zh-literature-search-tool-required",
		);
		expect(scenario).toBeDefined();

		assertScenarioTrace(scenario!, makeTrace());

		const broken = makeTrace({
			runs: [
				{
					...makeTrace().runs[0]!,
					result: {
						...makeTrace().runs[0]!.result,
						finalOutput: "是否现在执行检索？",
					},
					events: makeTrace().runs[0]!.events.filter((event) => event.type !== "tool_call_start"),
				},
			],
		});

		expect(collectScenarioIssues(scenario!, broken)).toEqual(
			expect.arrayContaining([
				expect.stringContaining("missing event: tool_call_start"),
				expect.stringContaining("missing tool: literature.search"),
				expect.stringContaining("forbidden final output phrase"),
			]),
		);
	});

	it("allows direct lifecycle assertions without duplicate session messages", async () => {
		const scenario = loadScenarioBank(scenariosDir).find((entry) => entry.id === "forced-direct-lifecycle");
		expect(scenario).toBeDefined();
		const trace = await runScenario(scenario!, {
			runtimeFactory: () =>
				createLeadAgentRuntime({
					cwd: makeTempDir(),
					directRunner: async () => "阅读框是阅读界面中用于承载文本内容的区域。",
					workerRunner: async () => {
						throw new Error("worker should not run");
					},
				}),
		});

		expect(trace.runs[0]?.result.decision.mode).toBe("direct");
		assertScenarioTrace(scenario!, trace);
	});

	it("supports custom traces for provider failure warning scenarios", () => {
		const scenario = loadScenarioBank(scenariosDir).find((entry) => entry.id === "provider-failure-warning");
		expect(scenario).toBeDefined();
		const trace = makeTrace({
			runs: [
				{
					...makeTrace().runs[0]!,
					result: {
						...makeTrace().runs[0]!.result,
						finalOutput: "Lead-level synthesis\n检索缺口 / provider warnings\n- provider failed",
					},
					events: [
						...makeTrace().runs[0]!.events,
						{
							type: "synthesis_complete",
							taskId: "scenario-task",
							sessionId: "session-synthetic",
							finalOutputLength: 73,
							acceptedArtifactCount: 1,
							rejectedStepCount: 0,
						},
						{
							type: "literature_provider_complete",
							taskId: "scenario-task",
							profileId: "literature-searcher",
							workerType: "literature-searcher",
							provider: "crossref",
							status: "failed",
							error: "provider failed",
						},
					],
				},
			],
		});

		assertScenarioTrace(scenario!, trace);
	});
});
