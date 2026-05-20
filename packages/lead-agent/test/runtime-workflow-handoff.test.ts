import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLeadAgentRuntime, type LeadAgentRunEvent } from "../src/index.js";
import { PlannerValidationError } from "../src/orchestration/llm-planner.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-runtime-handoff-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

function workflowPlan(taskId: string, sessionId: string, objective: string) {
	return {
		taskId,
		sessionId,
		objective,
		rationale: "Workflow execution is required.",
		userVisibleSummary: "I will gather evidence and then synthesize the result.",
		mode: "workflow" as const,
		steps: [
			{
				id: "literature-search",
				order: 1,
				profileId: "literature-searcher",
				objective: `User objective: ${objective}\n\nStep objective: Collect the search strategy and candidate sources.`,
				inputArtifactRefs: [],
				expectedArtifactKinds: ["search strategy"],
				expectedOutputs: ["search strategy"],
				acceptanceCriteria: ["Search scope and key concepts are explicit"],
			},
		],
		stopConditions: ["Workflow outputs accepted"],
	};
}

function emptyExecution(taskId: string, sessionId: string) {
	return {
		taskId,
		sessionId,
		accepted: false,
		stepResults: [],
		artifactBriefs: [],
		producedArtifacts: [],
		acceptanceReports: [],
	};
}

describe("lead-agent workflow handoff", () => {
	it("calls workflowExecutor when planner returns a workflow plan", async () => {
		let executorCalls = 0;
		const events: LeadAgentRunEvent[] = [];
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workflowPlanner: {
				async plan(input) {
					return workflowPlan(input.taskId, input.sessionId, input.objective);
				},
			},
			workflowExecutor: async (options) => {
				executorCalls++;
				options.onEvent?.({
					type: "workflow_start",
					taskId: options.plan.taskId,
					sessionId: options.plan.sessionId,
					stepCount: options.plan.steps.length,
					stepProfiles: options.plan.steps.map((step) => step.profileId),
				});
				options.onEvent?.({
					type: "workflow_complete",
					taskId: options.plan.taskId,
					sessionId: options.plan.sessionId,
					accepted: false,
					stepCount: options.plan.steps.length,
					producedArtifactKinds: [],
				});
				return emptyExecution(options.plan.taskId, options.plan.sessionId);
			},
		});

		await runtime.run({
			taskId: "task-valid-workflow-handoff",
			objective: "搜索近五年一型糖尿病相关文献，做一个简单综述",
			onEvent: (event) => events.push(event),
		});

		expect(executorCalls).toBe(1);
		expect(events.find((event) => event.type === "workflow_start")).toBeDefined();
	});

	it("calls workflowExecutor after heuristic fallback recovers a workflow plan", async () => {
		let executorCalls = 0;
		const events: LeadAgentRunEvent[] = [];
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workflowPlanner: {
				async plan() {
					throw new PlannerValidationError({
						objective: "搜索近五年一型糖尿病相关文献，做一个简单综述",
						firstErrors: ["Expected stopReason=toolUse, got error"],
						secondErrors: ["Expected stopReason=toolUse, got error"],
						repairAttempted: true,
						debugTrace: {
							modelId: "gpt-5-mini",
							modelProvider: "github-copilot",
							calls: [
								{
									attempt: "first",
									modelCallStarted: true,
									stopReason: "error",
									toolCallCount: 0,
									toolCallNames: [],
									validationErrors: [],
									failureReason: "no_tool_use_stop_reason",
								},
								{
									attempt: "repair",
									modelCallStarted: true,
									stopReason: "error",
									toolCallCount: 0,
									toolCallNames: [],
									validationErrors: [],
									failureReason: "no_tool_use_stop_reason",
								},
							],
							finalFailureReason: "no_tool_use_stop_reason",
						},
					});
				},
			},
			workflowExecutor: async (options) => {
				executorCalls++;
				options.onEvent?.({
					type: "workflow_start",
					taskId: options.plan.taskId,
					sessionId: options.plan.sessionId,
					stepCount: options.plan.steps.length,
					stepProfiles: options.plan.steps.map((step) => step.profileId),
				});
				return emptyExecution(options.plan.taskId, options.plan.sessionId);
			},
		});

		await runtime.run({
			taskId: "task-fallback-workflow-handoff",
			objective: "搜索近五年一型糖尿病相关文献，做一个简单综述",
			onEvent: (event) => events.push(event),
		});

		expect(executorCalls).toBe(1);
		expect(events.find((event) => event.type === "planner_fallback")).toBeDefined();
		expect(events.find((event) => event.type === "workflow_start")).toBeDefined();
	});
});
