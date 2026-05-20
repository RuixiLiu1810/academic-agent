import {
	type ArtifactBrief,
	type ArtifactRef,
	createAcceptanceReport,
	createExecutionTrace,
	type WorkerResult,
	type WorkflowPlan,
	type WorkflowStepResult,
} from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import type { WorkflowExecutionResult } from "../src/orchestration/executor.js";
import { synthesizeWorkflowFinalOutput } from "../src/orchestration/synthesis.js";

const plan: WorkflowPlan = {
	taskId: "task-synthesis",
	sessionId: "session-synthesis",
	objective: "帮我寻找NIR相关文献",
	rationale: "Run literature search.",
	userVisibleSummary: "I will search the literature.",
	mode: "workflow",
	stopConditions: ["accepted"],
	steps: [
		{
			id: "literature-search",
			order: 1,
			profileId: "literature-searcher",
			objective: "User objective: 帮我寻找NIR相关文献\n\nStep objective: Search literature.",
			inputArtifactRefs: [],
			expectedArtifactKinds: ["literature-search-results"],
			expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
			acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
		},
	],
};

function workerResult(overrides: Partial<WorkerResult>): WorkerResult {
	return {
		taskId: "worker-task",
		status: "success",
		summary: "See artifact lit-1.",
		producedArtifacts: [],
		warnings: [],
		openQuestions: [],
		executionTrace: createExecutionTrace("run-synthesis"),
		...overrides,
	};
}

function stepResult(options: {
	step: WorkflowPlan["steps"][number];
	result: WorkerResult;
	accepted: boolean;
	issues?: Parameters<typeof createAcceptanceReport>[1];
	artifactBriefs?: ArtifactBrief[];
}): WorkflowStepResult {
	const acceptanceReport = createAcceptanceReport(options.result, options.issues ?? []);
	return {
		step: options.step,
		workerResult: options.result,
		artifactBriefs: options.artifactBriefs ?? options.result.artifactBriefs ?? [],
		acceptanceReport: {
			...acceptanceReport,
			accepted: options.accepted,
		},
		decision: {
			kind: options.accepted ? "synthesize" : "stop",
			reason: options.accepted ? "accepted" : "rejected",
		},
	};
}

function execution(stepResults: WorkflowStepResult[]): WorkflowExecutionResult {
	return {
		taskId: plan.taskId,
		sessionId: plan.sessionId,
		accepted: stepResults.every((step) => step.acceptanceReport?.accepted),
		stepResults,
		artifactBriefs: stepResults.flatMap((step) => step.artifactBriefs),
		producedArtifacts: stepResults.flatMap((step) => step.workerResult?.producedArtifacts ?? []),
		acceptanceReports: stepResults.flatMap((step) => (step.acceptanceReport ? [step.acceptanceReport] : [])),
	};
}

describe("synthesizeWorkflowFinalOutput", () => {
	it("creates lead-level synthesis for single-step literature workflows instead of returning worker summary", () => {
		const artifact: ArtifactRef = {
			id: "lit-1",
			kind: "literature-search-results",
			uri: "memory://lit-1",
			title: "NIR literature search",
		};
		const brief: ArtifactBrief = {
			artifactId: "lit-1",
			kind: "literature-search-results",
			title: "NIR literature search",
			brief: "8 candidate records across spectroscopy and imaging.",
			keyFindings: ["Near-infrared spectroscopy reviews", "NIR imaging device papers"],
			limitations: ["Provider returned partial metadata"],
		};
		const result = workerResult({
			summary: "See artifact lit-1.",
			producedArtifacts: [artifact],
			artifactBriefs: [brief],
			warnings: ["Provider returned partial metadata"],
		});

		const output = synthesizeWorkflowFinalOutput(
			plan,
			execution([stepResult({ step: plan.steps[0]!, result, accepted: true })]),
		);

		expect(output).not.toBe("See artifact lit-1.");
		expect(output).toContain("Lead-level synthesis");
		expect(output).toContain("检索目标");
		expect(output).toContain("lit-1");
		expect(output).toContain("literature-search-results");
		expect(output).toContain("8 candidate records");
		expect(output).toContain("Provider returned partial metadata");
		expect(output).toContain("Artifact refs and briefs are pointers");
	});

	it("summarizes accepted artifacts from multi-step workflows", () => {
		const searchArtifact = { id: "lit-1", kind: "literature-search-results", uri: "memory://lit-1" };
		const evidenceArtifact = { id: "evidence-1", kind: "evidence-table", uri: "memory://evidence-1" };
		const secondStep = {
			...plan.steps[0]!,
			id: "evidence-summary",
			order: 2,
			profileId: "researcher",
			expectedArtifactKinds: ["evidence-table"],
			expectedOutputs: ["evidence summary"],
		};
		const output = synthesizeWorkflowFinalOutput(
			{ ...plan, steps: [plan.steps[0]!, secondStep] },
			execution([
				stepResult({
					step: plan.steps[0]!,
					result: workerResult({
						summary: "Search complete.",
						producedArtifacts: [searchArtifact],
						artifactBriefs: [
							{
								artifactId: "lit-1",
								kind: "literature-search-results",
								brief: "Literature candidates.",
							},
						],
					}),
					accepted: true,
				}),
				stepResult({
					step: secondStep,
					result: workerResult({
						summary: "Evidence summary complete.",
						producedArtifacts: [evidenceArtifact],
						artifactBriefs: [
							{
								artifactId: "evidence-1",
								kind: "evidence-table",
								brief: "Evidence rows grouped by application.",
							},
						],
					}),
					accepted: true,
				}),
			]),
		);

		expect(output).toContain("lit-1");
		expect(output).toContain("evidence-1");
		expect(output).toContain("Literature candidates.");
		expect(output).toContain("Evidence rows grouped by application.");
	});

	it("does not treat rejected step artifacts as accepted sources", () => {
		const rejectedArtifact = { id: "bad-evidence", kind: "evidence-table", uri: "memory://bad-evidence" };
		const output = synthesizeWorkflowFinalOutput(
			plan,
			execution([
				stepResult({
					step: plan.steps[0]!,
					result: workerResult({
						status: "failed",
						summary: "Failed but wrote bad-evidence.",
						producedArtifacts: [rejectedArtifact],
						failureReason: "missing required output",
					}),
					accepted: false,
					issues: [{ code: "worker_failed", message: "missing required output", severity: "error" }],
				}),
			]),
		);

		expect(output).toContain("Limitations");
		expect(output).toContain("missing required output");
		expect(output).not.toContain("bad-evidence (evidence-table)");
		expect(output).toContain("No accepted artifacts are available");
	});

	it("does not leak placeholder machine markers into normal final output", () => {
		const output = synthesizeWorkflowFinalOutput(
			plan,
			execution([
				stepResult({
					step: plan.steps[0]!,
					result: workerResult({
						summary:
							"Generated placeholder structured output for plumbing validation; model-backed profile execution is not implemented.",
						structuredOutputs: {
							runnerMode: "placeholder-structured-runner",
							modelBacked: false,
							verificationRequired: true,
							expectedOutputs: ["evidence summary"],
						},
						producedArtifacts: [
							{
								id: "placeholder-evidence",
								kind: "evidence-table",
								uri: "memory://placeholder-evidence",
								metadata: {
									runnerMode: "placeholder-structured-runner",
									modelBacked: false,
									verificationRequired: true,
								},
							},
						],
					}),
					accepted: true,
				}),
			]),
		);

		expect(output).not.toContain("runnerMode");
		expect(output).not.toContain("modelBacked");
		expect(output).not.toContain("verificationRequired");
		expect(output).not.toContain("Generated placeholder structured output for plumbing validation");
		expect(output).toContain("部分下游结构化分析目前为占位管线输出");
	});

	it("treats artifact briefs as pointers rather than full-text screening", () => {
		const output = synthesizeWorkflowFinalOutput(
			plan,
			execution([
				stepResult({
					step: plan.steps[0]!,
					result: workerResult({
						summary: "Literature search complete.",
						producedArtifacts: [
							{ id: "brief-only", kind: "literature-search-results", uri: "memory://brief-only" },
						],
						artifactBriefs: [
							{
								artifactId: "brief-only",
								kind: "literature-search-results",
								brief: "Metadata-only candidate bibliography.",
							},
						],
					}),
					accepted: true,
				}),
			]),
		);

		expect(output).toContain("Artifact refs and briefs are pointers");
		expect(output).not.toContain("已阅读全文");
		expect(output).not.toContain("完整筛选");
	});
});
