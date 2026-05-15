import { describe, expect, it } from "vitest";
import { summarizeWorkflowTemplatesForPlanner, WORKFLOW_TEMPLATES } from "../src/orchestration/templates.js";

describe("summarizeWorkflowTemplatesForPlanner", () => {
	it("returns one summary per template", () => {
		const summaries = summarizeWorkflowTemplatesForPlanner(WORKFLOW_TEMPLATES);
		expect(summaries).toHaveLength(WORKFLOW_TEMPLATES.length);
	});

	it("each summary has id, title, description, and steps array", () => {
		const summaries = summarizeWorkflowTemplatesForPlanner(WORKFLOW_TEMPLATES);
		for (const summary of summaries) {
			expect(typeof summary.id).toBe("string");
			expect(typeof summary.title).toBe("string");
			expect(typeof summary.description).toBe("string");
			expect(Array.isArray(summary.steps)).toBe(true);
		}
	});

	it("each step has profileId and role as strings", () => {
		const summaries = summarizeWorkflowTemplatesForPlanner(WORKFLOW_TEMPLATES);
		for (const summary of summaries) {
			for (const step of summary.steps) {
				expect(typeof step.profileId).toBe("string");
				expect(typeof step.role).toBe("string");
			}
		}
	});

	it("does not include acceptanceCriteria in any summary", () => {
		const summaries = summarizeWorkflowTemplatesForPlanner(WORKFLOW_TEMPLATES);
		expect(JSON.stringify(summaries)).not.toContain("acceptanceCriteria");
	});

	it("direct-writing has 0 steps in summary", () => {
		const summaries = summarizeWorkflowTemplatesForPlanner(WORKFLOW_TEMPLATES);
		const direct = summaries.find((s) => s.id === "direct-writing");
		expect(direct?.steps).toHaveLength(0);
	});

	it("evidence-synthesis has 2 steps in summary", () => {
		const summaries = summarizeWorkflowTemplatesForPlanner(WORKFLOW_TEMPLATES);
		const es = summaries.find((s) => s.id === "evidence-synthesis");
		expect(es?.steps).toHaveLength(2);
		expect(es?.steps[0]?.profileId).toBe("researcher");
		expect(es?.steps[1]?.profileId).toBe("writer");
	});
});
