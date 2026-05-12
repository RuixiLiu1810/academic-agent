import { describe, expect, it } from "vitest";
import {
	type AcceptanceReport,
	AgentContractSchemas,
	type ArtifactBrief,
	type ArtifactManifest,
	createAcceptanceReport,
	createExecutionTrace,
	createWorkflowPlan,
	deserializeAcceptanceReport,
	deserializeArtifactManifest,
	deserializeWorkerRequest,
	deserializeWorkerResult,
	isWorkerRequest,
	isWorkerResult,
	isWorkerResultSuccess,
	isWorkflowPlan,
	serializeContract,
	type WorkerRequest,
	type WorkerResult,
} from "../src/index.js";

describe("agent contracts", () => {
	it("creates execution traces and acceptance reports for worker results", () => {
		const request: WorkerRequest = {
			taskId: "task-1",
			workerType: "researcher",
			objective: "Collect evidence",
			constraints: ["Use provided files only"],
			inputArtifacts: [],
			expectedOutputs: ["evidence table"],
			acceptanceCriteria: ["has citations"],
		};
		const result: WorkerResult = {
			taskId: request.taskId,
			status: "success",
			summary: "Evidence collected",
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace("run-1", "session-1"),
		};

		expect(isWorkerResultSuccess(result)).toBe(true);
		expect(createAcceptanceReport(result)).toMatchObject({
			taskId: "task-1",
			accepted: true,
			summary: "Evidence collected",
		});
	});

	it("exports JSON schemas for the stable orchestration contracts", () => {
		expect(AgentContractSchemas).toMatchObject({
			version: expect.any(String),
			workerRequest: {
				title: "WorkerRequest",
				required: expect.arrayContaining(["taskId", "objective", "expectedOutputs"]),
			},
			workerResult: {
				title: "WorkerResult",
				required: expect.arrayContaining(["status", "summary", "executionTrace"]),
			},
			artifactManifest: {
				title: "ArtifactManifest",
			},
			acceptanceReport: {
				title: "AcceptanceReport",
			},
		});
		expect(JSON.parse(JSON.stringify(AgentContractSchemas))).toEqual(AgentContractSchemas);
	});

	it("round-trips worker requests through JSON serialization", () => {
		const request: WorkerRequest = {
			taskId: "task-roundtrip",
			workerType: "reviewer",
			objective: "Audit manuscript claims.",
			constraints: ["Use manuscript evidence only"],
			inputArtifacts: [
				{
					id: "artifact-1",
					kind: "manuscript",
					uri: "file:///tmp/manuscript.md",
					title: "Manuscript",
					metadata: {
						source: "test",
					},
				},
			],
			expectedOutputs: ["claim audit"],
			acceptanceCriteria: ["unsupported claims are listed"],
			executionBudget: {
				maxTurns: 1,
				timeoutMs: 1000,
			},
			profile: {
				id: "reviewer",
				name: "Reviewer",
				capabilities: ["claim-audit"],
			},
			metadata: {
				language: "zh-CN",
			},
		};

		const parsed = deserializeWorkerRequest(serializeContract(request));

		expect(parsed).toEqual(request);
		expect(isWorkerRequest(parsed)).toBe(true);
	});

	it("round-trips worker results through JSON serialization", () => {
		const result: WorkerResult = {
			taskId: "task-roundtrip",
			status: "success",
			summary: "Claim audit completed.",
			structuredOutputs: {
				findings: ["Missing citation"],
			},
			producedArtifacts: [
				{
					id: "artifact-2",
					kind: "claim-audit",
					uri: "memory://artifact-2",
					version: "v1",
				},
			],
			warnings: [],
			openQuestions: ["Should the lead agent revise section 2.1?"],
			executionTrace: {
				runId: "run-1",
				sessionId: "session-1",
				startedAt: "2026-05-08T00:00:00.000Z",
				endedAt: "2026-05-08T00:00:01.000Z",
				events: [
					{
						type: "worker_start",
						timestamp: "2026-05-08T00:00:00.000Z",
						message: "Audit manuscript claims.",
						data: {
							taskId: "task-roundtrip",
						},
					},
				],
			},
		};

		const parsed = deserializeWorkerResult(serializeContract(result));

		expect(parsed).toEqual(result);
		expect(isWorkerResult(parsed)).toBe(true);
	});

	it("round-trips artifact manifests and acceptance reports", () => {
		const manifest: ArtifactManifest = {
			id: "manifest-1",
			createdAt: "2026-05-08T00:00:00.000Z",
			updatedAt: "2026-05-08T00:00:01.000Z",
			artifacts: [
				{
					id: "artifact-1",
					kind: "evidence-table",
					uri: "memory://artifact-1",
				},
			],
		};
		const report: AcceptanceReport = {
			taskId: "task-roundtrip",
			accepted: false,
			checkedAt: "2026-05-08T00:00:02.000Z",
			issues: [
				{
					code: "missing_artifact",
					message: "Expected artifact was not produced.",
					severity: "error",
					artifactId: "artifact-1",
				},
			],
			summary: "Rejected because the required evidence table is missing.",
		};

		expect(deserializeArtifactManifest(serializeContract(manifest))).toEqual(manifest);
		expect(deserializeAcceptanceReport(serializeContract(report))).toEqual(report);
	});

	it("round-trips workflow plans", () => {
		const plan = createWorkflowPlan({
			taskId: "task-1",
			sessionId: "session-1",
			objective: "Audit citation support.",
			rationale: "Citation support is separable from final writing.",
			userVisibleSummary: "I will audit citations, then synthesize the result.",
			mode: "workflow",
			steps: [
				{
					id: "citation-audit",
					order: 1,
					profileId: "citation-checker",
					objective: "Identify unsupported claims.",
					inputArtifactRefs: [],
					expectedArtifactKinds: ["claim-audit"],
					expectedOutputs: ["citation audit"],
					acceptanceCriteria: ["Unsupported claims are identified"],
				},
			],
			stopConditions: ["Accepted citation audit is available"],
		});

		expect(isWorkflowPlan(plan)).toBe(true);
		expect(JSON.parse(JSON.stringify(plan))).toMatchObject({
			taskId: "task-1",
			sessionId: "session-1",
			mode: "workflow",
			steps: [{ profileId: "citation-checker" }],
		});
	});

	it("round-trips artifact briefs", () => {
		const brief: ArtifactBrief = {
			artifactId: "artifact-1",
			kind: "claim-audit",
			title: "Citation audit",
			brief: "Two claims need citation support.",
			keyFindings: ["Claim A lacks a source"],
			limitations: ["Full bibliography was not supplied"],
		};

		expect(JSON.parse(JSON.stringify(brief))).toEqual(brief);
	});

	it("rejects invalid serialized contracts", () => {
		expect(() =>
			deserializeWorkerRequest(
				JSON.stringify({
					taskId: "task-invalid",
					objective: "Missing required arrays and worker type",
				}),
			),
		).toThrow("Invalid WorkerRequest contract");
		expect(isWorkerRequest({ taskId: "task-invalid" })).toBe(false);
	});
});
