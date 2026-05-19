import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionTrace, type WorkerRequest, type WorkerResult } from "@mariozechner/pi-agent-contracts";
import { createAcademicArtifact, MemoryArtifactStore } from "@mariozechner/pi-artifact-core";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
import { executeWorkflowPlan } from "../src/orchestration/executor.js";
import { createLeadSessionWorkspace } from "../src/orchestration/workspace.js";

describe("executeWorkflowPlan", () => {
	it("runs steps in order and carries artifact refs forward", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lead-executor-"));
		try {
			const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-1" });
			const seenInputs: string[][] = [];
			const result = await executeWorkflowPlan({
				plan: {
					taskId: "task-1",
					sessionId: "session-1",
					objective: "Audit then revise.",
					rationale: "Two-step workflow.",
					userVisibleSummary: "I will audit citations, then revise.",
					mode: "workflow",
					steps: [
						{
							id: "citation-audit",
							order: 1,
							profileId: "citation-checker",
							objective: "Audit citations.",
							inputArtifactRefs: [],
							expectedArtifactKinds: ["claim-audit"],
							expectedOutputs: ["citation audit"],
							acceptanceCriteria: ["Unsupported claims are identified"],
						},
						{
							id: "revision-plan",
							order: 2,
							profileId: "reviser",
							objective: "Plan revisions.",
							inputArtifactRefs: [],
							expectedArtifactKinds: ["revision-plan"],
							expectedOutputs: ["revision plan"],
							acceptanceCriteria: ["Reviewer requests are addressed"],
						},
					],
					stopConditions: ["Revision plan accepted"],
				},
				profiles: DEFAULT_ACADEMIC_PROFILES,
				workspace,
				workerRunner: async (request): Promise<WorkerResult> => {
					seenInputs.push(request.inputArtifacts.map((artifact) => artifact.kind));
					return {
						taskId: request.taskId,
						status: "success",
						summary: `${request.expectedOutputs.join(", ")} completed`,
						structuredOutputs: { expectedOutputs: request.expectedOutputs },
						producedArtifacts: [
							{
								id: `${request.workerType}-artifact`,
								kind: request.workerType === "citation-checker" ? "claim-audit" : "revision-plan",
								uri: `memory://${request.workerType}`,
								title: `${request.workerType} artifact`,
							},
						],
						artifactBriefs: [
							{
								artifactId: `${request.workerType}-artifact`,
								kind: request.workerType === "citation-checker" ? "claim-audit" : "revision-plan",
								brief: `${request.workerType} brief`,
							},
						],
						warnings: [],
						openQuestions: [],
						executionTrace: createExecutionTrace(`run-${request.workerType}`),
					};
				},
			});

			expect(result.stepResults).toHaveLength(2);
			expect(result.accepted).toBe(true);
			expect(result.artifactBriefs.map((brief) => brief.kind)).toEqual(["claim-audit", "revision-plan"]);
			expect(seenInputs).toEqual([[], ["claim-audit"]]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("retries a failed worker once before accepting the step", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lead-executor-retry-"));
		try {
			const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-retry" });
			let attempts = 0;
			const result = await executeWorkflowPlan({
				plan: {
					taskId: "task-retry",
					sessionId: "session-retry",
					objective: "Retry the worker once.",
					rationale: "The step should recover from a transient failure.",
					userVisibleSummary: "I will retry once if the worker fails.",
					mode: "workflow",
					steps: [
						{
							id: "citation-audit",
							order: 1,
							profileId: "citation-checker",
							objective: "Audit citations.",
							inputArtifactRefs: [],
							expectedArtifactKinds: ["claim-audit"],
							expectedOutputs: ["citation audit"],
							acceptanceCriteria: ["Unsupported claims are identified"],
						},
					],
					stopConditions: ["Citation audit accepted"],
				},
				profiles: DEFAULT_ACADEMIC_PROFILES,
				workspace,
				workerRunner: async (request): Promise<WorkerResult> => {
					attempts += 1;
					if (attempts === 1) {
						return {
							taskId: request.taskId,
							status: "failed",
							summary: "first attempt failed",
							producedArtifacts: [],
							warnings: ["transient provider error"],
							openQuestions: [],
							executionTrace: createExecutionTrace("run-retry-1"),
							failureReason: "transient provider error",
						};
					}
					return {
						taskId: request.taskId,
						status: "success",
						summary: "citation audit completed",
						structuredOutputs: { expectedOutputs: request.expectedOutputs },
						producedArtifacts: [
							{
								id: "claim-audit-artifact",
								kind: "claim-audit",
								uri: "memory://claim-audit-artifact",
							},
						],
						warnings: [],
						openQuestions: [],
						executionTrace: createExecutionTrace("run-retry-2"),
					};
				},
			});

			expect(attempts).toBe(2);
			expect(result.accepted).toBe(true);
			expect(result.stepResults[0]?.decision.kind).toBe("synthesize");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("asks the user when a step succeeds but returns a blocking open question", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lead-executor-question-"));
		try {
			const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-question" });
			const result = await executeWorkflowPlan({
				plan: {
					taskId: "task-question",
					sessionId: "session-question",
					objective: "Stop and ask the user for missing manuscript context.",
					rationale: "The worker cannot continue without a missing attachment.",
					userVisibleSummary: "I will ask for the missing manuscript if it blocks review.",
					mode: "workflow",
					steps: [
						{
							id: "review",
							order: 1,
							profileId: "reviewer",
							objective: "Review the manuscript.",
							inputArtifactRefs: [],
							expectedArtifactKinds: ["review-comment-map"],
							expectedOutputs: ["review memo"],
							acceptanceCriteria: ["Findings are severity ordered"],
						},
					],
					stopConditions: ["Review memo accepted"],
				},
				profiles: DEFAULT_ACADEMIC_PROFILES,
				workspace,
				workerRunner: async (request): Promise<WorkerResult> => ({
					taskId: request.taskId,
					status: "success",
					summary: "review memo completed",
					structuredOutputs: { expectedOutputs: request.expectedOutputs },
					producedArtifacts: [],
					warnings: [],
					openQuestions: [{ question: "Need the full manuscript before final review.", blocksExecution: true }],
					executionTrace: createExecutionTrace("run-question"),
				}),
			});

			expect(result.accepted).toBe(false);
			expect(result.stepResults[0]?.decision).toEqual({
				kind: "ask_user",
				reason: "Worker reported a blocking open question.",
				question: "Need the full manuscript before final review.",
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("retrieves small artifact content for later workflow steps when a store is available", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lead-executor-retrieval-"));
		try {
			const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-retrieval" });
			const artifactStore = new MemoryArtifactStore();
			const outlineArtifact = createAcademicArtifact(artifactStore, {
				kind: "outline",
				title: "Existing outline",
				content: "I. Background\nII. Methods\nIII. Results",
			});
			const seenRetrievedContent: string[] = [];
			await executeWorkflowPlan({
				plan: {
					taskId: "task-retrieval",
					sessionId: "session-retrieval",
					objective: "Expand the outline into a draft.",
					rationale: "Later steps should be able to read small stored artifacts.",
					userVisibleSummary: "I will read the outline and expand it into a draft.",
					mode: "workflow",
					steps: [
						{
							id: "draft",
							order: 1,
							profileId: "writer",
							objective: "Expand the outline into a draft.",
							inputArtifactRefs: [
								{
									id: outlineArtifact.id,
									kind: outlineArtifact.kind,
									uri: outlineArtifact.uri,
									title: outlineArtifact.title,
								},
							],
							expectedArtifactKinds: ["draft-text"],
							expectedOutputs: ["draft text"],
							acceptanceCriteria: ["Style is consistent"],
						},
					],
					stopConditions: ["Draft accepted"],
				},
				profiles: DEFAULT_ACADEMIC_PROFILES,
				workspace,
				artifactStore,
				workerRunner: async (request): Promise<WorkerResult> => {
					const retrieved = (request.metadata?.retrievedArtifacts as Array<{ content: string }> | undefined) ?? [];
					seenRetrievedContent.push(...retrieved.map((item) => item.content));
					return {
						taskId: request.taskId,
						status: "success",
						summary: "draft text completed",
						structuredOutputs: { expectedOutputs: request.expectedOutputs },
						producedArtifacts: [
							{
								id: "draft-text-artifact",
								kind: "draft-text",
								uri: "memory://draft-text-artifact",
							},
						],
						warnings: [],
						openQuestions: [],
						executionTrace: createExecutionTrace("run-retrieval"),
					};
				},
			});

			expect(seenRetrievedContent).toEqual(["I. Background\nII. Methods\nIII. Results"]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("passes previous acceptance issues into attemptContext on retry", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lead-executor-attempt-context-"));
		try {
			const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-attempt-context" });
			const workerRequests: WorkerRequest[] = [];
			const result = await executeWorkflowPlan({
				plan: {
					taskId: "task-attempt-context",
					sessionId: "session-attempt-context",
					mode: "workflow",
					objective: "Retry with acceptance feedback.",
					rationale: "Exercise retry context.",
					userVisibleSummary: "Run one retrying step.",
					stopConditions: ["accepted"],
					steps: [
						{
							id: "step-1",
							order: 1,
							profileId: "researcher",
							objective: "Summarize the evidence.",
							expectedArtifactKinds: [],
							expectedOutputs: ["evidence summary"],
							acceptanceCriteria: [],
							inputArtifactRefs: [],
						},
					],
				},
				profiles: [
					{
						id: "researcher",
						name: "Researcher",
						description: "Research worker",
						rolePrompt: "You are a researcher.",
						capabilities: [],
						expectedOutputs: [],
						acceptanceChecklist: [],
					},
				],
				workspace,
				workerRunner: async (request): Promise<WorkerResult> => {
					workerRequests.push(request);
					return {
						taskId: request.taskId,
						status: "success",
						summary: workerRequests.length === 1 ? "Incomplete response" : "evidence summary complete",
						structuredOutputs: {},
						producedArtifacts: [],
						warnings: [],
						openQuestions: [],
						executionTrace: createExecutionTrace(`attempt-${workerRequests.length}`),
					};
				},
			});

			expect(result.accepted).toBe(true);
			expect(workerRequests).toHaveLength(2);
			expect(workerRequests[0]?.attemptContext?.attempt).toBe(1);
			expect(workerRequests[0]?.attemptContext?.previousIssues).toBeUndefined();
			expect(workerRequests[1]?.attemptContext?.attempt).toBe(2);
			expect(workerRequests[1]?.attemptContext?.previousIssues?.[0]?.code).toBe("narrative_output_missing_token");
			expect(workerRequests[1]?.attemptContext?.previousFailureReason).toContain("summary");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("injects a bounded lead context package into worker requests", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lead-executor-context-package-"));
		try {
			const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-context-package" });
			const workerRequests: WorkerRequest[] = [];
			await executeWorkflowPlan({
				plan: {
					taskId: "task-context-package",
					sessionId: "session-context-package",
					mode: "workflow",
					objective: "Continue NIR synthesis.",
					rationale: "Use prior literature results first, then synthesize.",
					userVisibleSummary: "I will use the prior literature artifact.",
					stopConditions: ["accepted"],
					steps: [
						{
							id: "step-1",
							order: 1,
							profileId: "researcher",
							objective: "Summarize prior literature candidates.",
							expectedArtifactKinds: ["evidence-table"],
							expectedOutputs: ["evidence summary"],
							acceptanceCriteria: ["Summary mentions NIR"],
							inputArtifactRefs: [
								{ id: "prior-lit", kind: "literature-search-results", uri: "memory://prior-lit" },
							],
						},
						{
							id: "step-2",
							order: 2,
							profileId: "writer",
							objective: "Write a short synthesis.",
							expectedArtifactKinds: ["draft-text"],
							expectedOutputs: ["draft text"],
							acceptanceCriteria: ["Draft mentions NIR"],
							inputArtifactRefs: [],
						},
					],
				},
				profiles: DEFAULT_ACADEMIC_PROFILES,
				workspace,
				conversationContext: {
					sessionId: "session-context-package",
					currentObjective: "Continue NIR synthesis.",
					recentUserObjectives: ["Find NIR literature."],
					recentLeadOutputs: ["Initial search completed."],
					recentDecisions: [],
					recentWorkflowResults: [
						{
							taskId: "task-previous",
							accepted: true,
							producedArtifactKinds: ["literature-search-results"],
							issues: [],
						},
					],
					priorArtifacts: [{ id: "prior-lit", kind: "literature-search-results", uri: "memory://prior-lit" }],
					artifactBriefs: [
						{
							artifactId: "prior-lit",
							kind: "literature-search-results",
							brief: "NIR candidate bibliography.",
						},
					],
					compactionSummary: "Previous work focused on NIR spectroscopy.",
					budget: { maxChars: 12000, usedChars: 500, truncatedSections: [] },
				},
				workerRunner: async (request): Promise<WorkerResult> => {
					workerRequests.push(request);
					return {
						taskId: request.taskId,
						status: "success",
						summary: request.workerType === "researcher" ? "NIR evidence summary" : "NIR draft text",
						structuredOutputs: { expectedOutputs: request.expectedOutputs },
						producedArtifacts: [
							{
								id: `${request.workerType}-artifact`,
								kind: request.workerType === "researcher" ? "evidence-table" : "draft-text",
								uri: `memory://${request.workerType}-artifact`,
							},
						],
						artifactBriefs: [
							{
								artifactId: `${request.workerType}-artifact`,
								kind: request.workerType === "researcher" ? "evidence-table" : "draft-text",
								brief: `${request.workerType} brief`,
							},
						],
						warnings: [],
						openQuestions: [],
						executionTrace: createExecutionTrace(`context-package-${request.workerType}`),
					};
				},
			});

			const firstPackage = workerRequests[0]?.metadata?.leadContextPackage;
			expect(firstPackage).toMatchObject({
				currentObjective: "Continue NIR synthesis.",
				currentStepObjective: "Summarize prior literature candidates.",
				allowedArtifactIds: ["prior-lit"],
				compactionSummary: "Previous work focused on NIR spectroscopy.",
			});
			expect(firstPackage).toMatchObject({
				relevantPriorObjectives: ["Find NIR literature."],
			});
			const secondPackage = workerRequests[1]?.metadata?.leadContextPackage;
			expect(secondPackage).toMatchObject({
				allowedArtifactIds: ["researcher-artifact"],
			});
			expect(JSON.stringify(secondPackage)).toContain("researcher brief");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
