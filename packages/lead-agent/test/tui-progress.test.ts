import { describe, expect, it } from "vitest";
import { describeLeadTuiProgressEvent } from "../src/modes/tui/lead-tui-mode.js";

describe("describeLeadTuiProgressEvent", () => {
	it("formats planner source and plan mode progress lines", () => {
		expect(
			describeLeadTuiProgressEvent({
				type: "planner_complete",
				taskId: "task-1",
				sessionId: "session-1",
				mode: "workflow",
				planMode: "workflow",
				stepCount: 2,
				stepProfiles: ["literature-searcher", "researcher"],
				userVisibleSummary: "I will gather evidence.",
				plannerSource: "fallback",
				fallbackUsed: true,
				fallbackReason: "validation_failed",
			}),
		).toContain("Planner source fallback -> workflow");
	});

	it("formats workflow and worker lifecycle lines", () => {
		expect(
			describeLeadTuiProgressEvent({
				type: "workflow_start",
				taskId: "task-1",
				sessionId: "session-1",
				stepCount: 1,
				stepProfiles: ["literature-searcher"],
			}),
		).toBe("Workflow started (1 steps)");
		expect(
			describeLeadTuiProgressEvent({
				type: "worker_start",
				taskId: "task-1",
				stepId: "literature-search",
				profileId: "literature-searcher",
				workerType: "literature-searcher",
				attempt: 1,
			}),
		).toBe("Worker started: literature-searcher (attempt 1)");
	});

	it("keeps plan summaries in progress output only", () => {
		expect(
			describeLeadTuiProgressEvent({
				type: "plan_summary",
				taskId: "task-1",
				sessionId: "session-1",
				mode: "workflow",
				stepCount: 2,
				summary: "I will gather evidence and then synthesize.",
			}),
		).toBe("Plan: I will gather evidence and then synthesize.");
	});
});
