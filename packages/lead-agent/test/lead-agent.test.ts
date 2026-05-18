import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkerResult } from "@mariozechner/pi-agent-contracts";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { SessionManager } from "@mariozechner/pi-agent-host";
import { afterEach, describe, expect, it } from "vitest";
import type { LeadAgentTaskRequest } from "../src/index.js";
import { createLeadAgentRuntime, loadAcademicProfilesFromDir, parseAcademicProfileMarkdown } from "../src/index.js";
import { summarizeWorkflowTemplatesForPlanner, WORKFLOW_TEMPLATES } from "../src/orchestration/index.js";
import { buildLeadDirectMessage } from "../src/prompts.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-agent-runtime-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

describe("lead-agent runtime", () => {
	it("loads academic profiles from markdown soul files", () => {
		const profiles = loadAcademicProfilesFromDir();
		const citationChecker = profiles.find((profile) => profile.id === "citation-checker");

		expect(profiles.map((profile) => profile.id)).toEqual([
			"citation-checker",
			"literature-searcher",
			"method-auditor",
			"researcher",
			"reviewer",
			"reviser",
			"writer",
		]);
		expect(citationChecker?.rolePrompt).toContain("claim-support checker");
		expect(citationChecker?.expectedOutputs).toContain("citation audit");
		expect(citationChecker?.acceptanceChecklist).toContain("Unsupported claims are identified");
		const searcher = profiles.find((profile) => profile.id === "literature-searcher");
		expect(searcher?.rolePrompt).toContain("literature search planner");
		expect(searcher?.expectedOutputs).toContain("search strategy");
		expect(searcher?.expectedOutputs).toContain("bibliography candidates");
		expect(searcher?.acceptanceChecklist).toContain("Candidate bibliography is separated from verified evidence");
	});

	it("parses standalone profile markdown into worker profile fields", () => {
		const profile = parseAcademicProfileMarkdown(
			"custom-auditor",
			`# Custom Auditor

Audit custom academic work.

## Role Prompt

Use the custom audit role.

## Capabilities

- custom-audit

## Output Requirements

- custom audit

## Acceptance Checklist

- Custom gap is explicit

## Allowed Tools

- literature.search

## Tool Policy

- maxCalls: 2
- defaultProviders: crossref, semantic-scholar
- allowedProviders: crossref, semantic-scholar, pubmed, arxiv
- maxResultsPerProvider: 10
- timeoutMs: 12000
- requireArtifactOutput: true
- allowRefresh: false

## Input Requirements

- Search topic

## Boundaries

- Do not invent retrieved papers
`,
		);

		expect(profile).toMatchObject({
			id: "custom-auditor",
			name: "Custom Auditor",
			description: "Audit custom academic work.",
			rolePrompt: "Use the custom audit role.",
			capabilities: ["custom-audit"],
			expectedOutputs: ["custom audit"],
			acceptanceChecklist: ["Custom gap is explicit"],
			allowedTools: ["literature.search"],
			toolPolicy: {
				maxCalls: 2,
				defaultProviders: ["crossref", "semantic-scholar"],
				allowedProviders: ["crossref", "semantic-scholar", "pubmed", "arxiv"],
				maxResultsPerProvider: 10,
				timeoutMs: 12000,
				requireArtifactOutput: true,
				allowRefresh: false,
			},
			inputRequirements: ["Search topic"],
			boundaries: ["Do not invent retrieved papers"],
		});
	});

	it("keeps unified writing tasks in the lead agent", async () => {
		const runtime = createLeadAgentRuntime({
			workerRunner: async () => {
				throw new Error("worker should not run");
			},
			directRunner: async (req) => `Synthesized: ${req.objective}`,
		});

		const result = await runtime.run({
			taskId: "task-1",
			objective: "Rewrite this paragraph into concise academic Chinese.",
		});

		expect(result.decision.mode).toBe("direct");
		expect(result.finalOutput).toBe("Synthesized: Rewrite this paragraph into concise academic Chinese.");
		expect(result.sessionId).toBe(runtime.sessionManager.getSessionId());
		expect(runtime.sessionManager.getEntries().some((entry) => entry.type === "custom")).toBe(true);
	});

	it("runs the workflow planner for writing requests when the planner selects a workflow", async () => {
		let plannerCalls = 0;
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			directRunner: async () => {
				throw new Error("direct runner should not run");
			},
			workflowPlanner: {
				async plan(input) {
					plannerCalls += 1;
					return {
						taskId: input.taskId,
						sessionId: input.sessionId,
						objective: input.objective,
						rationale: "Outline-to-draft workflow is needed for this writing request.",
						userVisibleSummary: "I will build an outline and then draft the text.",
						mode: "workflow",
						steps: [
							{
								id: "outline",
								order: 1,
								profileId: "writer",
								objective: "Produce a bounded outline.",
								inputArtifactRefs: input.inputArtifacts,
								expectedArtifactKinds: ["outline"],
								expectedOutputs: ["outline"],
								acceptanceCriteria: ["Claims are bounded"],
							},
						],
						stopConditions: ["Outline accepted"],
					};
				},
			},
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: "outline completed",
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-writing-planner"),
			}),
		});

		const result = await runtime.run({
			taskId: "task-writing-planner",
			objective: "写一版引言初稿，先整理提纲，再生成学术中文草稿。",
			expectedOutputs: ["outline"],
		});

		expect(plannerCalls).toBe(1);
		expect(result.decision.mode).toBe("worker");
		expect(result.workflowPlan?.steps.map((step) => step.profileId)).toEqual(["writer"]);
		expect(result.finalOutput).toContain("outline completed");
	});

	it("returns a clarification result before running workers when the planner blocks execution", async () => {
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			directRunner: async () => {
				throw new Error("direct runner should not run");
			},
			workflowPlanner: {
				async plan(input) {
					return {
						taskId: input.taskId,
						sessionId: input.sessionId,
						objective: input.objective,
						rationale: "The planner needs the target journal before continuing.",
						userVisibleSummary: "I need one detail before I can plan the workflow.",
						mode: "workflow",
						steps: [
							{
								id: "review",
								order: 1,
								profileId: "reviewer",
								objective: "Review the draft once the journal target is known.",
								inputArtifactRefs: [],
								expectedArtifactKinds: ["review-comment-map"],
								expectedOutputs: ["review memo"],
								acceptanceCriteria: ["Findings are severity ordered"],
							},
						],
						stopConditions: ["Review memo accepted"],
						requiresClarification: {
							question: "目标期刊是什么？",
							reason: "不同期刊会改变审稿标准和输出格式。",
							blocksExecution: true,
						},
					};
				},
			},
			workerRunner: async () => {
				throw new Error("worker should not run");
			},
		});

		const result = await runtime.run({
			taskId: "task-clarification",
			objective: "请帮我审阅并重写 response letter。",
		});

		expect(result.clarification).toEqual({
			question: "目标期刊是什么？",
			reason: "不同期刊会改变审稿标准和输出格式。",
			blocksExecution: true,
		});
		expect(result.finalOutput).toContain("目标期刊是什么？");
		expect(result.workerResult).toBeUndefined();
		expect(result.acceptanceReport).toBeUndefined();
	});

	it("emits workflow progress events for non-direct runs", async () => {
		const events: Array<{ type: string }> = [];
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workflowPlanner: {
				async plan(input) {
					return {
						taskId: input.taskId,
						sessionId: input.sessionId,
						objective: input.objective,
						rationale: "The request should run a one-step review workflow.",
						userVisibleSummary: "I will run a reviewer pass and return the accepted memo.",
						mode: "workflow",
						steps: [
							{
								id: "review",
								order: 1,
								profileId: "reviewer",
								objective: "Review the manuscript.",
								inputArtifactRefs: input.inputArtifacts,
								expectedArtifactKinds: ["review-comment-map"],
								expectedOutputs: ["review memo"],
								acceptanceCriteria: ["Findings are severity ordered"],
							},
						],
						stopConditions: ["Review memo accepted"],
					};
				},
			},
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: "review memo completed",
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [
					{
						id: "review-comment-map",
						kind: "review-comment-map",
						uri: "memory://review-comment-map",
						title: "Review comment map",
					},
				],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-workflow-events"),
			}),
		});

		await runtime.run({
			taskId: "task-workflow-events",
			objective: "审阅这篇稿子并给出 review memo。",
			expectedOutputs: ["review memo"],
			onEvent: ((event: { type: string }) => {
				events.push(event);
			}) as never,
		} as LeadAgentTaskRequest & { onEvent: (event: { type: string }) => void });

		expect(events.map((event) => event.type)).toEqual([
			"plan_summary",
			"workflow_step_start",
			"workflow_step_complete",
		]);
	});

	it("records a planner override event when an explicit profile forces fallback planning", async () => {
		const sessionManager = SessionManager.inMemory(makeTempDir());
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			sessionManager,
			workflowPlanner: {
				async plan(input) {
					return {
						taskId: input.taskId,
						sessionId: input.sessionId,
						objective: input.objective,
						rationale: "Planner chose a reviewer workflow.",
						userVisibleSummary: "I will review the manuscript.",
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
					};
				},
			},
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: "methods audit completed",
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-planner-override"),
			}),
		});

		await runtime.run({
			taskId: "task-planner-override",
			objective: "Review this manuscript.",
			profileId: "method-auditor",
			expectedOutputs: ["methods audit"],
		});

		const customEntries = sessionManager.getEntries().filter((entry) => entry.type === "custom");
		expect(
			customEntries.some((entry) => entry.type === "custom" && entry.customType === "lead-agent.planner_override"),
		).toBe(true);
	});

	it("dispatches separable research tasks to a worker and accepts the result", async () => {
		const workerResult: WorkerResult = {
			taskId: "task-2",
			status: "success",
			summary: "Evidence gaps: missing cohort flow and citation support.",
			producedArtifacts: [
				{
					id: "claim-audit-1",
					kind: "claim-audit",
					uri: "memory://claim-audit-1",
				},
			],
			artifactBriefs: [
				{
					artifactId: "claim-audit-1",
					kind: "claim-audit",
					brief: "Missing cohort flow and citation support.",
				},
			],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace("run-1"),
		};
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workerRunner: async (request) => ({ ...workerResult, taskId: request.taskId }),
		});

		const result = await runtime.run({
			taskId: "task-2",
			objective: "Review the manuscript evidence and identify citation gaps.",
			expectedOutputs: ["Evidence gaps"],
		});

		expect(result.decision).toMatchObject({
			mode: "worker",
			workerType: "citation-checker",
		});
		expect(result.acceptanceReport?.accepted).toBe(true);
		expect(result.finalOutput).toContain("Evidence gaps");
		expect(result.workflowPlan).toMatchObject({
			mode: "workflow",
			steps: [{ profileId: "citation-checker" }],
		});
		expect(result.artifactBriefs).toEqual(workerResult.artifactBriefs);
	});

	it("accepts researcher outputs when structured labels use camelCase or headings", async () => {
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workflowPlanner: {
				async plan(input) {
					return {
						taskId: input.taskId,
						sessionId: input.sessionId,
						objective: input.objective,
						rationale: "The request needs a researcher evidence pass.",
						userVisibleSummary: "I will run the Researcher worker and synthesize the accepted result.",
						mode: "workflow",
						steps: [
							{
								id: "researcher",
								order: 1,
								profileId: "researcher",
								objective: `User objective: ${input.objective}\n\nStep objective: Find representative NIR literature and return an evidence table with uncertainty notes.`,
								inputArtifactRefs: [],
								expectedArtifactKinds: ["evidence-table"],
								expectedOutputs: ["evidence-table", "uncertainty notes"],
								acceptanceCriteria: ["Evidence is separated from interpretation"],
							},
						],
						stopConditions: ["Researcher output accepted"],
					};
				},
			},
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: "Located representative peer-reviewed sources on NIR with uncertainty notes.",
				structuredOutputs: {
					evidenceTable: [{ title: "Near-infrared spectroscopy review" }],
					rawAssistantText: "## Evidence Table\n\nFive NIR sources.\n\n## Uncertainty Notes\n\nDomain is broad.",
				},
				producedArtifacts: [
					{
						id: "evidence-table",
						kind: "evidence-table",
						uri: "memory://evidence-table",
						title: "Evidence table",
					},
				],
				warnings: [],
				openQuestions: [{ question: "Which NIR application should be prioritized?" }],
				executionTrace: createExecutionTrace("run-nir"),
			}),
		});

		const result = await runtime.run({
			taskId: "task-nir-literature",
			objective: "帮我寻找一些关于NIR的文献",
		});

		expect(result.acceptanceReport?.accepted).toBe(true);
		expect(result.finalOutput).toContain("Located representative peer-reviewed sources");
		expect(result.acceptanceReport?.issues.some((issue) => issue.code === "expected_output_missing")).toBe(false);
	});

	it("exposes literature search templates to the workflow planner", () => {
		const summaries = summarizeWorkflowTemplatesForPlanner(WORKFLOW_TEMPLATES);
		const literatureSearch = summaries.find((template) => template.id === "literature-search");
		const literatureToEvidence = summaries.find((template) => template.id === "literature-to-evidence");

		expect(literatureSearch).toMatchObject({
			id: "literature-search",
			steps: [{ profileId: "literature-searcher" }],
		});
		expect(literatureToEvidence).toMatchObject({
			id: "literature-to-evidence",
			steps: [{ profileId: "literature-searcher" }, { profileId: "researcher" }],
		});
	});

	it("accepts literature-searcher outputs without requiring evidence synthesis", async () => {
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workflowPlanner: {
				async plan(input) {
					return {
						taskId: input.taskId,
						sessionId: input.sessionId,
						objective: input.objective,
						rationale: "The request asks for literature discovery, not evidence synthesis.",
						userVisibleSummary: "I will run a literature searcher pass and return candidate search outputs.",
						mode: "workflow",
						steps: [
							{
								id: "literature-search",
								order: 1,
								profileId: "literature-searcher",
								objective: `User objective: ${input.objective}\n\nStep objective: Build an offline structured search strategy and candidate bibliography hints.`,
								inputArtifactRefs: input.inputArtifacts,
								expectedArtifactKinds: ["literature-search-results"],
								expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
								acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
							},
						],
						stopConditions: ["Literature search plan accepted"],
					};
				},
			},
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary:
					"Offline structured literature search plan completed for NIR with search strategy, bibliography candidates, and retrieval gaps.",
				structuredOutputs: {
					"search strategy": {
						retrievalMode: "offline-structured",
						providerAvailable: false,
					},
					"bibliography candidates": ["near-infrared spectroscopy review candidates"],
					"retrieval gaps": ["NIR application domain is broad"],
				},
				producedArtifacts: [
					{
						id: "nir-literature-search",
						kind: "literature-search-results",
						uri: "memory://nir-literature-search",
						title: "NIR candidate bibliography",
					},
				],
				artifactBriefs: [
					{
						artifactId: "nir-literature-search",
						kind: "literature-search-results",
						title: "NIR literature search plan",
						brief: "Offline structured search plan and candidate bibliography hints.",
						limitations: ["Not verified database retrieval results"],
					},
				],
				warnings: ["Offline structured mode; verify candidates with a database search before citation use."],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-literature-searcher"),
			}),
		});

		const result = await runtime.run({
			taskId: "task-literature-searcher",
			objective: "帮我寻找一些关于NIR的文献",
			expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
		});

		expect(result.decision).toMatchObject({
			mode: "worker",
			profileId: "literature-searcher",
			workerType: "literature-searcher",
		});
		expect(result.acceptanceReport?.accepted).toBe(true);
		expect(result.acceptanceReport?.issues.some((issue) => issue.code === "expected_output_missing")).toBe(false);
		expect(result.finalOutput).toContain("Offline structured literature search plan completed");
	});

	it("carries literature-searcher artifact briefs into researcher synthesis", async () => {
		const seenRequests: string[] = [];
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workflowPlanner: {
				async plan(input) {
					return {
						taskId: input.taskId,
						sessionId: input.sessionId,
						objective: input.objective,
						rationale: "The request needs search planning before evidence synthesis.",
						userVisibleSummary: "I will search first, then synthesize evidence from the accepted search outputs.",
						mode: "workflow",
						steps: [
							{
								id: "literature-search",
								order: 1,
								profileId: "literature-searcher",
								objective: `User objective: ${input.objective}\n\nStep objective: Build search strategy and bibliography candidates.`,
								inputArtifactRefs: [],
								expectedArtifactKinds: ["literature-search-results"],
								expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
								acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
							},
							{
								id: "evidence-summary",
								order: 2,
								profileId: "researcher",
								objective: `User objective: ${input.objective}\n\nStep objective: Synthesize accepted search outputs into evidence notes.`,
								inputArtifactRefs: [],
								expectedArtifactKinds: ["evidence-table"],
								expectedOutputs: ["evidence summary", "evidence-table", "uncertainty notes"],
								acceptanceCriteria: ["Uncertainty is explicit"],
							},
						],
						stopConditions: ["Evidence synthesis accepted"],
					};
				},
			},
			workerRunner: async (request): Promise<WorkerResult> => {
				seenRequests.push(
					`${request.workerType}:${request.inputArtifacts.map((artifact) => artifact.kind).join(",")}`,
				);
				if (request.workerType === "literature-searcher") {
					return {
						taskId: request.taskId,
						status: "success",
						summary: "search strategy, bibliography candidates, and retrieval gaps completed",
						structuredOutputs: {
							"search strategy": "offline structured",
							"bibliography candidates": ["NIR spectroscopy review"],
							"retrieval gaps": ["Specify application domain"],
						},
						producedArtifacts: [
							{
								id: "search-artifact-1",
								kind: "literature-search-results",
								uri: "memory://search-artifact-1",
								title: "NIR search results",
							},
						],
						artifactBriefs: [
							{
								artifactId: "search-artifact-1",
								kind: "literature-search-results",
								title: "NIR search results",
								brief: "Search strategy and candidate bibliography hints.",
							},
						],
						warnings: [],
						openQuestions: [],
						executionTrace: createExecutionTrace("run-searcher"),
					};
				}
				return {
					taskId: request.taskId,
					status: "success",
					summary: "evidence summary, evidence-table, and uncertainty notes completed",
					structuredOutputs: {
						"evidence summary": "NIR literature spans spectroscopy and imaging.",
						"evidence-table": [{ topic: "NIR spectroscopy" }],
						"uncertainty notes": ["Search candidates require database verification."],
					},
					producedArtifacts: [
						{
							id: "evidence-table",
							kind: "evidence-table",
							uri: "memory://evidence-table",
						},
					],
					warnings: [],
					openQuestions: [],
					executionTrace: createExecutionTrace("run-researcher"),
				};
			},
		});

		const result = await runtime.run({
			taskId: "task-literature-to-evidence",
			objective: "寻找NIR相关文献并整理证据表",
		});

		expect(result.acceptanceReport?.accepted).toBe(true);
		expect(result.workflowPlan?.steps.map((step) => step.profileId)).toEqual(["literature-searcher", "researcher"]);
		expect(seenRequests).toEqual(["literature-searcher:", "researcher:literature-search-results"]);
	});

	it("rejects worker results that miss explicit expected outputs", async () => {
		const workerResult: WorkerResult = {
			taskId: "task-expected-output",
			status: "success",
			summary: "General review completed.",
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace("run-expected-output"),
		};
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workerRunner: async (request) => ({ ...workerResult, taskId: request.taskId }),
		});

		const result = await runtime.run({
			taskId: "task-expected-output",
			objective: "Review the manuscript evidence.",
			expectedOutputs: ["citation audit"],
		});

		expect(result.decision.mode).toBe("worker");
		expect(result.acceptanceReport?.accepted).toBe(false);
		expect(result.acceptanceReport?.issues).toContainEqual({
			code: "narrative_output_missing_token",
			message: "citation audit missing token: citation audit",
			severity: "error",
		});
		expect(result.finalOutput).toContain("not accepted");
	});

	it("keeps explicit worker runner override for literature tasks", async () => {
		let called = false;
		const runtime = createLeadAgentRuntime({
			workerRunner: async (request) => {
				called = true;
				return {
					taskId: request.taskId,
					status: "success",
					summary: "literature-search-results custom runner",
					producedArtifacts: [{ id: "artifact-1", kind: "literature-search-results", uri: "memory://artifact-1" }],
					artifactBriefs: [
						{
							artifactId: "artifact-1",
							kind: "literature-search-results",
							brief: "custom runner artifact",
						},
					],
					warnings: [],
					openQuestions: [],
					executionTrace: createExecutionTrace("custom-runner"),
				};
			},
		});

		const result = await runtime.run({
			taskId: "task-custom-runner",
			objective: "帮我寻找一些关于NIR的文献",
			expectedOutputs: ["literature-search-results"],
		});

		expect(called).toBe(true);
		expect(result.acceptanceReport?.accepted).toBe(true);
	});

	it("records lead decisions in a caller-provided host session", async () => {
		const sessionManager = SessionManager.inMemory("/tmp/lead-agent-test");
		const runtime = createLeadAgentRuntime({
			sessionManager,
			directRunner: async (req) => `done: ${req.objective}`,
			workerRunner: async () => {
				throw new Error("worker should not run");
			},
		});

		await runtime.run({
			taskId: "task-3",
			objective: "Polish the conclusion paragraph.",
		});

		expect(runtime.sessionManager).toBe(sessionManager);
		expect(sessionManager.getCwd()).toBe("/tmp/lead-agent-test");
		expect(sessionManager.getEntries().map((entry) => entry.type)).toEqual([
			"message",
			"custom",
			"message",
			"custom",
		]);
	});

	it("turns worker failures into rejected acceptance reports", async () => {
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workerRunner: async () => {
				throw new Error("worker unavailable");
			},
		});

		const result = await runtime.run({
			taskId: "task-4",
			objective: "Review the manuscript methods for reproducibility.",
		});

		expect(result.decision.mode).toBe("worker");
		expect(result.workerResult?.status).toBe("failed");
		expect(result.acceptanceReport?.accepted).toBe(false);
		expect(result.acceptanceReport?.issues[0]).toMatchObject({
			code: "worker_failed",
			severity: "error",
		});
		expect(result.finalOutput).toContain("not accepted");
	});

	it("routes explicit citation task type to the citation checker profile", async () => {
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: "citation audit completed",
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-explicit-citation"),
			}),
		});

		const result = await runtime.run({
			taskId: "task-explicit-citation",
			objective: "Check this paragraph.",
			taskType: "citation",
			expectedOutputs: ["citation audit"],
		});

		expect(result.decision).toMatchObject({
			mode: "worker",
			profileId: "citation-checker",
			workerType: "citation-checker",
		});
		expect(result.acceptanceReport?.accepted).toBe(true);
	});

	it("does not treat fallback narrative outputs as artifact requirements", async () => {
		let expectedArtifactKinds: string[] | undefined;
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workerRunner: async (request) => {
				expectedArtifactKinds = request.outputContract?.requirements
					.filter((requirement) => requirement.kind === "artifact")
					.map((requirement) => requirement.artifactKind);
				return {
					taskId: request.taskId,
					status: "success",
					summary: "evidence summary completed",
					producedArtifacts: [],
					warnings: [],
					openQuestions: [],
					executionTrace: createExecutionTrace("run-fallback-narrative"),
				};
			},
		});

		const result = await runtime.run({
			taskId: "task-fallback-narrative",
			objective: "Summarize the evidence.",
			profileId: "researcher",
			expectedOutputs: ["evidence summary"],
		});

		expect(result.workflowPlan?.steps[0]?.expectedArtifactKinds).toEqual([]);
		expect(expectedArtifactKinds).toEqual([]);
		expect(result.acceptanceReport?.accepted).toBe(true);
	});

	it("lets explicit profile override task type", async () => {
		const runtime = createLeadAgentRuntime({
			cwd: makeTempDir(),
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: "methods audit completed",
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-profile-override"),
			}),
		});

		const result = await runtime.run({
			taskId: "task-profile-override",
			objective: "Review this paragraph.",
			taskType: "citation",
			profileId: "method-auditor",
			expectedOutputs: ["methods audit"],
		});

		expect(result.decision).toMatchObject({
			mode: "worker",
			profileId: "method-auditor",
			workerType: "method-auditor",
		});
		expect(result.acceptanceReport?.accepted).toBe(true);
	});

	it("honors direct dispatch override even when a worker profile matches", async () => {
		const runtime = createLeadAgentRuntime({
			workerRunner: async () => {
				throw new Error("worker should not run");
			},
			directRunner: async (req) => req.objective,
		});

		const result = await runtime.run({
			taskId: "task-direct-override",
			objective: "Review this manuscript for citation gaps.",
			dispatchMode: "direct",
		});

		expect(result.decision.mode).toBe("direct");
		expect(result.finalOutput).toContain("Review this manuscript");
	});

	it("calls directRunner with the task request and uses its return as finalOutput", async () => {
		const captured: LeadAgentTaskRequest[] = [];
		const runtime = createLeadAgentRuntime({
			directRunner: async (req) => {
				captured.push(req);
				return "Lead author synthesis result.";
			},
			workerRunner: async () => {
				throw new Error("should not run");
			},
		});

		const result = await runtime.run({
			taskId: "task-direct-runner",
			objective: "Synthesize the abstract.",
			constraints: ["150 words max"],
			dispatchMode: "direct",
		});

		expect(result.decision.mode).toBe("direct");
		expect(result.finalOutput).toBe("Lead author synthesis result.");
		expect(captured).toHaveLength(1);
		expect(captured[0]?.objective).toBe("Synthesize the abstract.");
		expect(captured[0]?.constraints).toContain("150 words max");
	});
});

describe("buildLeadDirectMessage", () => {
	it("includes the objective", () => {
		const prompt = buildLeadDirectMessage({ objective: "Draft the introduction." });
		expect(prompt).toContain("Draft the introduction.");
	});

	it("includes constraints when provided", () => {
		const prompt = buildLeadDirectMessage({
			objective: "Write abstract.",
			constraints: ["250 words max", "no first person"],
		});
		expect(prompt).toContain("250 words max");
		expect(prompt).toContain("no first person");
	});

	it("includes expected outputs when provided", () => {
		const prompt = buildLeadDirectMessage({
			objective: "Synthesize findings.",
			expectedOutputs: ["summary paragraph"],
		});
		expect(prompt).toContain("summary paragraph");
	});

	it("omits constraints section when not provided", () => {
		const prompt = buildLeadDirectMessage({ objective: "Polish conclusion." });
		expect(prompt).not.toContain("Constraints:");
	});
});
