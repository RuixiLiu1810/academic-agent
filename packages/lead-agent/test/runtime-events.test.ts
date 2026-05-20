import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionTrace, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { createLeadAgentRuntime, type LeadAgentRunEvent } from "../src/index.js";
import { PlannerValidationError } from "../src/orchestration/llm-planner.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-runtime-events-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function eventTypes(events: readonly LeadAgentRunEvent[]): string[] {
	return events.map((event) => event.type);
}

function expectOrderedSubset(values: readonly string[], expected: readonly string[]): void {
	let cursor = -1;
	for (const value of expected) {
		const next = values.findIndex((entry, index) => index > cursor && entry === value);
		expect(next, `missing ordered event ${value}`).toBeGreaterThan(cursor);
		cursor = next;
	}
}

function successfulArtifactWorker(requestTaskId: string): WorkerResult {
	return {
		taskId: requestTaskId,
		status: "success",
		summary: "search strategy, bibliography candidates, and retrieval gaps completed",
		structuredOutputs: {
			"search strategy": "NIR search",
			"bibliography candidates": ["candidate"],
			"retrieval gaps": ["provider metadata only"],
		},
		producedArtifacts: [
			{
				id: "lit-event-1",
				kind: "literature-search-results",
				uri: "memory://lit-event-1",
				title: "NIR literature event artifact",
			},
		],
		artifactBriefs: [
			{
				artifactId: "lit-event-1",
				kind: "literature-search-results",
				title: "NIR literature event artifact",
				brief: "Event test literature artifact brief.",
			},
		],
		warnings: [],
		openQuestions: [],
		executionTrace: createExecutionTrace("runtime-events-worker"),
	};
}

describe("lead-agent runtime progress events", () => {
	it("emits ordered planner, workflow, acceptance, synthesis, and session memory events", async () => {
		const events: LeadAgentRunEvent[] = [];
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workerRunner: async (request) => successfulArtifactWorker(request.taskId),
		});

		await runtime.run({
			taskId: "task-event-order",
			objective: "帮我寻找NIR相关文献",
			onEvent: (event) => events.push(event),
		});

		expectOrderedSubset(eventTypes(events), [
			"planner_start",
			"planner_complete",
			"workflow_start",
			"workflow_step_start",
			"worker_start",
			"worker_complete",
			"artifact_created",
			"acceptance_start",
			"acceptance_complete",
			"workflow_step_complete",
			"workflow_complete",
			"synthesis_start",
			"synthesis_complete",
			"session_memory_updated",
		]);
	});

	it("emits artifact_created without artifact content", async () => {
		const events: LeadAgentRunEvent[] = [];
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workerRunner: async (request) => successfulArtifactWorker(request.taskId),
		});

		await runtime.run({
			taskId: "task-artifact-event",
			objective: "帮我寻找NIR相关文献",
			onEvent: (event) => events.push(event),
		});

		const artifactEvent = events.find((event) => event.type === "artifact_created");
		expect(artifactEvent).toMatchObject({
			type: "artifact_created",
			artifactId: "lit-event-1",
			artifactKind: "literature-search-results",
			title: "NIR literature event artifact",
			taskId: "task-artifact-event",
			stepId: "literature-search",
			profileId: "literature-searcher",
		});
		expect(JSON.stringify(artifactEvent)).not.toContain("content");
	});

	it("emits acceptance_complete issue counts for rejected worker results", async () => {
		const events: LeadAgentRunEvent[] = [];
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: "Incomplete.",
				producedArtifacts: [],
				warnings: ["partial result"],
				openQuestions: [],
				executionTrace: createExecutionTrace("runtime-events-rejected"),
			}),
		});

		await runtime.run({
			taskId: "task-acceptance-event",
			objective: "帮我寻找NIR相关文献",
			onEvent: (event) => events.push(event),
		});

		const event = events.find((entry) => entry.type === "acceptance_complete");
		expect(event).toMatchObject({
			type: "acceptance_complete",
			accepted: false,
			issueCount: expect.any(Number),
			errorCount: expect.any(Number),
			warningCount: expect.any(Number),
		});
		if (event?.type === "acceptance_complete") {
			expect(event.errorCount).toBeGreaterThan(0);
			expect(event.issueCodesPreview).toContain("artifact_missing");
		}
	});

	it("emits synthesis and session memory lifecycle events for forced direct mode", async () => {
		const events: LeadAgentRunEvent[] = [];
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			directRunner: async () => "Direct answer.",
			workerRunner: async () => {
				throw new Error("worker should not run");
			},
		});

		await runtime.run({
			taskId: "task-direct-events",
			objective: "直接润色这段话",
			dispatchMode: "direct",
			onEvent: (event) => events.push(event),
		});

		expectOrderedSubset(eventTypes(events), ["synthesis_start", "synthesis_complete", "session_memory_updated"]);
		expect(events.find((event) => event.type === "synthesis_complete")).toMatchObject({
			type: "synthesis_complete",
			finalOutputLength: "Direct answer.".length,
			acceptedArtifactCount: 0,
			rejectedStepCount: 0,
		});
	});

	it("emits planner_error event when planner throws PlannerValidationError", async () => {
		const events: LeadAgentRunEvent[] = [];
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workflowPlanner: {
				async plan() {
					throw new PlannerValidationError({
						objective: "搜索近五年一型糖尿病相关文献，做一个简单综述",
						firstErrors: ["Workflow plans must contain at least one step"],
						secondErrors: ["Workflow plans must contain at least one step"],
						repairAttempted: true,
						debugTrace: {
							modelId: "test-model",
							modelProvider: "test-provider",
							calls: [
								{
									attempt: "first",
									modelCallStarted: true,
									stopReason: "toolUse",
									toolCallCount: 1,
									toolCallNames: ["submit_workflow_plan"],
									rawToolArgsPreview: '{"plan":{"mode":"workflow","steps":[]}}',
									parsedPlanPreview: '{"mode":"workflow","steps":[]}',
									validationErrors: ["Workflow plans must contain at least one step"],
									failureReason: "validation_failed",
								},
								{
									attempt: "repair",
									modelCallStarted: true,
									stopReason: "toolUse",
									toolCallCount: 1,
									toolCallNames: ["submit_workflow_plan"],
									rawToolArgsPreview: '{"plan":{"mode":"workflow","steps":[]}}',
									parsedPlanPreview: '{"mode":"workflow","steps":[]}',
									validationErrors: ["Workflow plans must contain at least one step"],
									failureReason: "validation_failed",
								},
							],
							finalFailureReason: "validation_failed",
						},
					});
				},
			},
			workerRunner: async () => {
				throw new Error("worker should not run");
			},
		});

		await runtime.run({
			taskId: "task-planner-error-event",
			objective: "搜索近五年一型糖尿病相关文献，做一个简单综述",
			onEvent: (event) => events.push(event),
		});

		const errorEvent = events.find((e) => e.type === "planner_error");
		expect(errorEvent).toBeDefined();
		expect(errorEvent).toMatchObject({
			type: "planner_error",
			taskId: "task-planner-error-event",
			errorName: "PlannerValidationError",
			reason: "validation_failed",
			repairAttempted: true,
		});
		if (errorEvent?.type === "planner_error") {
			expect(errorEvent.firstErrors).toContain("Workflow plans must contain at least one step");
			expect(errorEvent.secondErrors).toContain("Workflow plans must contain at least one step");
		}
	});
});
