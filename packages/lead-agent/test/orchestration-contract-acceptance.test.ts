import { createExecutionTrace, type WorkerRequest, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import { createTypedArtifactWriter, MemoryArtifactStore } from "@mariozechner/pi-artifact-core";
import { describe, expect, it } from "vitest";
import { createLeadAcceptanceReport, createLeadContractAcceptanceReport } from "../src/orchestration/acceptance.js";

function contractRequest(): WorkerRequest {
	return {
		taskId: "task-contract-acceptance",
		workerType: "researcher",
		objective: "Create an evidence table.",
		constraints: [],
		inputArtifacts: [],
		expectedOutputs: ["evidence-table"],
		acceptanceCriteria: ["Evidence rows are stored as a typed artifact"],
		outputContract: {
			contractId: "contract:evidence-table",
			profileId: "researcher",
			successMode: "all-required",
			requirements: [
				{
					kind: "artifact",
					id: "evidence-table",
					label: "Evidence table",
					required: true,
					artifactKind: "evidence-table",
					minCount: 1,
					schemaRef: {
						id: "evidence-table-artifact",
						version: "v1",
					},
				},
			],
		},
	};
}

function result(overrides: Partial<WorkerResult>): WorkerResult {
	return {
		taskId: "task-contract-acceptance",
		status: "success",
		summary: "Worker completed.",
		producedArtifacts: [],
		warnings: [],
		openQuestions: [],
		executionTrace: createExecutionTrace("run-contract-acceptance"),
		...overrides,
	};
}

describe("contract-aware lead acceptance", () => {
	it("accepts valid typed evidence-table artifacts", () => {
		const store = new MemoryArtifactStore();
		const writer = createTypedArtifactWriter(store);
		const artifact = writer.write({
			kind: "evidence-table",
			title: "Evidence table",
			payload: {
				kind: "evidence-table",
				rows: [
					{
						claimId: "claim-1",
						claim: "NIR spectroscopy is used in analytical chemistry.",
						support: "supported",
						sourceArtifactIds: ["source-1"],
					},
				],
				uncertaintySummary: "Limited smoke fixture.",
			},
		});

		const report = createLeadContractAcceptanceReport(contractRequest(), result({ producedArtifacts: [artifact] }), {
			artifactStore: store,
		});

		expect(report.accepted).toBe(true);
		expect(report.issues.filter((issue) => issue.severity === "error")).toEqual([]);
	});

	it("rejects missing required artifacts", () => {
		const report = createLeadContractAcceptanceReport(contractRequest(), result({ producedArtifacts: [] }));

		expect(report.accepted).toBe(false);
		expect(report.issues).toContainEqual({
			code: "artifact_missing",
			message: "Missing artifact kind: evidence-table",
			severity: "error",
		});
	});

	it("rejects unreadable JSON artifacts when a schema ref is required", () => {
		const store = new MemoryArtifactStore();
		const artifact = store.create({
			kind: "evidence-table",
			title: "Evidence table",
			mediaType: "application/json",
			content: "{not-json",
		});

		const report = createLeadContractAcceptanceReport(contractRequest(), result({ producedArtifacts: [artifact] }), {
			artifactStore: store,
		});

		expect(report.accepted).toBe(false);
		expect(report.issues).toContainEqual({
			code: "artifact_unreadable",
			message: `Artifact content is not valid JSON: ${artifact.id}`,
			severity: "error",
			artifactId: artifact.id,
		});
	});

	it("keeps legacy request acceptance compatible", () => {
		const request: WorkerRequest = {
			taskId: "task-legacy-acceptance",
			workerType: "researcher",
			objective: "Summarize evidence.",
			constraints: [],
			inputArtifacts: [],
			expectedOutputs: ["evidence table"],
			acceptanceCriteria: [],
		};
		const report = createLeadAcceptanceReport(
			request,
			result({
				taskId: request.taskId,
				summary: "Evidence table: NIR spectroscopy has multiple uses.",
			}),
		);

		expect(report.accepted).toBe(true);
	});
});
