import { describe, expect, it } from "vitest";
import { detectRoute, didPlannerRecover } from "../scripts/diagnose-planner-runtime.js";

describe("detectRoute", () => {
	it("returns workflow when workflow_start is present", () => {
		expect(detectRoute([{ type: "planner_complete" }, { type: "workflow_start" }, { type: "synthesis_start" }])).toBe(
			"workflow",
		);
	});

	it("returns workflow when worker_start is present", () => {
		expect(detectRoute([{ type: "planner_complete" }, { type: "worker_start" }, { type: "synthesis_start" }])).toBe(
			"workflow",
		);
	});

	it("returns direct when only synthesis_start is present", () => {
		expect(detectRoute([{ type: "planner_complete" }, { type: "synthesis_start" }])).toBe("direct");
	});

	it("returns unknown when no routing events are present", () => {
		expect(detectRoute([{ type: "planner_start" }, { type: "planner_complete" }])).toBe("unknown");
	});

	it("detects recovery when planner_error and planner_complete both occur", () => {
		expect(
			didPlannerRecover([{ type: "planner_error" }, { type: "workflow_start" }, { type: "planner_complete" }]),
		).toBe(true);
	});

	it("does not report recovery without planner_complete", () => {
		expect(didPlannerRecover([{ type: "planner_error" }, { type: "workflow_start" }])).toBe(false);
	});
});
