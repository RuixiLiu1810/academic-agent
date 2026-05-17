import { createExecutionTrace, type WorkerRequest, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { createLeadAcceptanceReport } from "../src/orchestration/acceptance.js";

function request(expectedOutputs: string[]): WorkerRequest {
	return {
		taskId: "task-acceptance",
		workerType: "researcher",
		objective: "Find NIR literature.",
		constraints: [],
		inputArtifacts: [],
		expectedOutputs,
		acceptanceCriteria: [],
	};
}

function result(overrides: Partial<WorkerResult>): WorkerResult {
	return {
		taskId: "task-acceptance",
		status: "success",
		summary: "Worker completed.",
		producedArtifacts: [],
		warnings: [],
		openQuestions: [],
		executionTrace: createExecutionTrace("run-acceptance"),
		...overrides,
	};
}

describe("lead acceptance", () => {
	it("accepts equivalent output labels across kebab, camel, and heading forms", () => {
		const report = createLeadAcceptanceReport(
			request(["evidence-table", "uncertainty-notes"]),
			result({
				structuredOutputs: {
					evidenceTable: [{ title: "Near-infrared spectroscopy review" }],
					rawAssistantText: "## Evidence Table\n\n...\n\n## Uncertainty Notes\n\nDomain is broad.",
				},
			}),
		);

		expect(report.accepted).toBe(true);
		expect(report.issues.filter((issue) => issue.code === "expected_output_missing")).toEqual([]);
	});

	it("accepts artifact briefs as structured deliverables", () => {
		const report = createLeadAcceptanceReport(
			request(["evidence-table"]),
			result({
				artifactBriefs: [
					{
						artifactId: "artifact-1",
						kind: "evidence-table",
						title: "NIR literature table",
						brief: "Five representative sources on NIR.",
					},
				],
			}),
		);

		expect(report.accepted).toBe(true);
	});

	it("accepts literature search artifact briefs as search deliverables", () => {
		const report = createLeadAcceptanceReport(
			request(["search strategy", "bibliography candidates", "retrieval gaps"]),
			result({
				artifactBriefs: [
					{
						artifactId: "search-artifact-1",
						kind: "literature-search-results",
						title: "NIR search strategy",
						brief: "Search strategy, bibliography candidates, and retrieval gaps for NIR.",
						keyFindings: ["bibliography candidates"],
						limitations: ["retrieval gaps"],
					},
				],
			}),
		);

		expect(report.accepted).toBe(true);
	});

	it("still rejects genuinely missing expected outputs", () => {
		const report = createLeadAcceptanceReport(
			request(["citation audit"]),
			result({
				structuredOutputs: {
					evidenceTable: [],
				},
			}),
		);

		expect(report.accepted).toBe(false);
		expect(report.issues).toContainEqual({
			code: "expected_output_missing",
			message: "Worker result did not satisfy expected output: citation audit",
			severity: "error",
		});
	});
});
