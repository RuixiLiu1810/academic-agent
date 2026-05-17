import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ArtifactRef, WorkerRequest, WorkerResult } from "@mariozechner/pi-agent-contracts";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import {
	ACADEMIC_ARTIFACT_KINDS,
	type ArtifactStore,
	createAcademicArtifact,
	FileSystemArtifactStore,
	MemoryArtifactStore,
} from "@mariozechner/pi-artifact-core";
import { createLeadAgentRuntime, type LeadAgentResult, type LeadAgentWorkerRunner } from "./index.js";
import type { WorkflowPlanner } from "./orchestration/index.js";

export interface AcademicSmokeCase {
	id: string;
	objective: string;
	fixtureFiles: string[];
	expectedProfileId?: string;
	expectedStepProfileIds?: string[];
	expectedOutputs: string[];
	artifactKind?: string;
	artifactKinds?: string[];
}

export interface AcademicSmokeCaseResult {
	caseId: string;
	result: LeadAgentResult;
	passed: boolean;
	failures: string[];
}

export interface AcademicSmokeSuiteResult {
	results: AcademicSmokeCaseResult[];
	artifactRefs: ArtifactRef[];
	manifestPath?: string;
	passed: boolean;
}

export interface RunAcademicSmokeSuiteOptions {
	fixtureDir?: string;
	artifactDir?: string;
	workerRunner?: LeadAgentWorkerRunner;
	liveLiteratureSearch?: boolean;
}

export const DEFAULT_ACADEMIC_SMOKE_CASES: AcademicSmokeCase[] = [
	{
		id: "direct-writing",
		objective: "Rewrite the manuscript background excerpt into concise academic Chinese without adding claims.",
		fixtureFiles: ["manuscript_excerpt.md"],
		expectedOutputs: [],
	},
	{
		id: "literature-search",
		objective:
			"Find literature about NIR and return a structured literature search plan with candidate bibliography hints.",
		fixtureFiles: ["nir_literature_prompt.md"],
		expectedProfileId: "literature-searcher",
		expectedStepProfileIds: ["literature-searcher"],
		expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
		artifactKinds: [ACADEMIC_ARTIFACT_KINDS.literatureSearchResults],
	},
	{
		id: "citation-check",
		objective: "Review the manuscript evidence notes and identify citation gaps.",
		fixtureFiles: ["manuscript_excerpt.md", "evidence_notes.md"],
		expectedProfileId: "citation-checker",
		expectedOutputs: ["citation audit"],
		artifactKind: ACADEMIC_ARTIFACT_KINDS.claimAudit,
	},
	{
		id: "method-audit",
		objective: "Audit the methods section for reproducibility and missing-data assumptions.",
		fixtureFiles: ["method_section.md", "review_comments.md"],
		expectedProfileId: "method-auditor",
		expectedOutputs: ["methods audit"],
		artifactKind: ACADEMIC_ARTIFACT_KINDS.revisionPlan,
	},
	{
		id: "review-memo",
		objective: "Review the manuscript and reviewer comments, then produce severity ordered findings.",
		fixtureFiles: ["manuscript_excerpt.md", "review_comments.md"],
		expectedProfileId: "reviewer",
		expectedStepProfileIds: ["reviewer"],
		expectedOutputs: ["review memo"],
		artifactKinds: [ACADEMIC_ARTIFACT_KINDS.reviewCommentMap],
	},
	{
		id: "mini-paperorchestra-inputs",
		objective: "Use the idea and experimental log to produce an evidence summary and outline.",
		fixtureFiles: ["idea.md", "experimental_log.md"],
		expectedProfileId: "researcher",
		expectedStepProfileIds: ["researcher", "writer"],
		expectedOutputs: ["evidence summary", "outline"],
		artifactKinds: [ACADEMIC_ARTIFACT_KINDS.evidenceTable, ACADEMIC_ARTIFACT_KINDS.outline],
	},
];

function defaultFixtureDir(): string {
	return join(import.meta.dirname, "../test/fixtures/academic-smoke");
}

function readFixtureContext(fixtureDir: string, fixtureFiles: string[]): string {
	return fixtureFiles
		.map((filename) => {
			const content = readFileSync(join(fixtureDir, filename), "utf8").trim();
			return `## ${filename}\n\n${content}`;
		})
		.join("\n\n");
}

function createStore(options: RunAcademicSmokeSuiteOptions): ArtifactStore {
	return options.artifactDir ? new FileSystemArtifactStore(options.artifactDir) : new MemoryArtifactStore();
}

function deterministicWorkerRunner(store: ArtifactStore): LeadAgentWorkerRunner {
	return async (request: WorkerRequest): Promise<WorkerResult> => {
		const artifact = createAcademicArtifact(store, {
			kind:
				request.workerType === "literature-searcher"
					? ACADEMIC_ARTIFACT_KINDS.literatureSearchResults
					: request.workerType === "citation-checker"
						? ACADEMIC_ARTIFACT_KINDS.claimAudit
						: request.workerType === "method-auditor"
							? ACADEMIC_ARTIFACT_KINDS.revisionPlan
							: request.workerType === "reviewer"
								? ACADEMIC_ARTIFACT_KINDS.reviewCommentMap
								: request.workerType === "reviser"
									? ACADEMIC_ARTIFACT_KINDS.revisionPlan
									: request.workerType === "writer"
										? ACADEMIC_ARTIFACT_KINDS.outline
										: ACADEMIC_ARTIFACT_KINDS.evidenceTable,
			title: `${request.workerType} smoke artifact`,
			content: `${request.workerType}: ${request.expectedOutputs.join(", ")}`,
			metadata: {
				taskId: request.taskId,
				workerType: request.workerType,
			},
		});
		const expectedText = request.expectedOutputs.join("; ");
		return {
			taskId: request.taskId,
			status: "success",
			summary: `${expectedText} completed for ${request.workerType}.`,
			structuredOutputs: {
				expectedOutputs: request.expectedOutputs,
				workerType: request.workerType,
			},
			producedArtifacts: [
				{
					id: artifact.id,
					kind: artifact.kind,
					uri: artifact.uri,
					title: artifact.title,
					version: artifact.version,
				},
			],
			artifactBriefs: [
				{
					artifactId: artifact.id,
					kind: artifact.kind,
					title: artifact.title,
					brief: `${request.workerType} produced ${expectedText}.`,
					keyFindings: request.expectedOutputs,
				},
			],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace(`academic-smoke-${request.taskId}`),
		};
	};
}

function createAcademicSmokePlanner(): WorkflowPlanner {
	return {
		async plan(input) {
			if (input.taskId === "literature-search") {
				return {
					taskId: input.taskId,
					sessionId: input.sessionId,
					objective: input.objective,
					rationale: "The smoke case asks for literature discovery before evidence synthesis.",
					userVisibleSummary: "I will run a literature searcher pass and return accepted search outputs.",
					mode: "workflow",
					steps: [
						{
							id: "literature-search",
							order: 1,
							profileId: "literature-searcher",
							objective: `User objective: ${input.objective}\n\nStep objective: Build an offline structured search strategy and candidate bibliography hints.`,
							inputArtifactRefs: input.inputArtifacts,
							expectedArtifactKinds: [ACADEMIC_ARTIFACT_KINDS.literatureSearchResults],
							expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
							acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
						},
					],
					stopConditions: ["Literature search plan accepted"],
				};
			}
			if (input.taskId !== "mini-paperorchestra-inputs") {
				return {
					taskId: input.taskId,
					sessionId: input.sessionId,
					objective: input.objective,
					rationale: "Smoke test: direct fallback for non-orchestrated cases.",
					userVisibleSummary: "I will handle this directly.",
					mode: "direct",
					steps: [],
					stopConditions: ["Final answer produced"],
				};
			}
			return {
				taskId: input.taskId,
				sessionId: input.sessionId,
				objective: input.objective,
				rationale: "The smoke case needs evidence extraction before writing synthesis.",
				userVisibleSummary: "I will extract evidence, then draft an outline from accepted evidence.",
				mode: "workflow",
				steps: [
					{
						id: "evidence-summary",
						order: 1,
						profileId: "researcher",
						objective: "Separate experimental observations from interpretation.",
						inputArtifactRefs: input.inputArtifacts,
						expectedArtifactKinds: [ACADEMIC_ARTIFACT_KINDS.evidenceTable],
						expectedOutputs: ["evidence summary"],
						acceptanceCriteria: ["Evidence is separated from interpretation"],
					},
					{
						id: "outline",
						order: 2,
						profileId: "writer",
						objective: "Turn accepted evidence into a bounded outline.",
						inputArtifactRefs: [],
						expectedArtifactKinds: [ACADEMIC_ARTIFACT_KINDS.outline],
						expectedOutputs: ["outline"],
						acceptanceCriteria: ["Claims are bounded"],
					},
				],
				stopConditions: ["Outline accepted"],
			};
		},
	};
}

function failuresForCase(testCase: AcademicSmokeCase, result: LeadAgentResult): string[] {
	const failures: string[] = [];
	if (testCase.expectedProfileId && result.decision.profileId !== testCase.expectedProfileId) {
		failures.push(`expected profile ${testCase.expectedProfileId}, got ${result.decision.profileId ?? "none"}`);
	}
	if (testCase.expectedOutputs.length === 0 && result.decision.mode !== "direct") {
		failures.push(`expected direct mode, got ${result.decision.mode}`);
	}
	if (testCase.expectedOutputs.length > 0 && result.decision.mode !== "worker") {
		failures.push(`expected worker mode, got ${result.decision.mode}`);
	}
	if (testCase.expectedStepProfileIds) {
		const actualProfileIds = result.workflowPlan?.steps.map((step) => step.profileId) ?? [];
		if (actualProfileIds.join(",") !== testCase.expectedStepProfileIds.join(",")) {
			failures.push(
				`expected workflow steps ${testCase.expectedStepProfileIds.join(",")}, got ${actualProfileIds.join(",")}`,
			);
		}
	}
	if (result.acceptanceReport && !result.acceptanceReport.accepted) {
		failures.push(`acceptance rejected: ${result.acceptanceReport.issues.map((issue) => issue.code).join(", ")}`);
	}
	if (
		testCase.artifactKind &&
		!result.workerResult?.producedArtifacts.some((artifact) => artifact.kind === testCase.artifactKind)
	) {
		failures.push(`expected artifact kind ${testCase.artifactKind}`);
	}
	for (const artifactKind of testCase.artifactKinds ?? []) {
		if (!result.artifactBriefs?.some((artifact) => artifact.kind === artifactKind)) {
			failures.push(`expected artifact brief kind ${artifactKind}`);
		}
	}
	return failures;
}

function failedSmokeResult(testCase: AcademicSmokeCase, error: unknown): LeadAgentResult {
	const message = error instanceof Error ? error.message : String(error);
	return {
		taskId: testCase.id,
		finalOutput: `Smoke case failed: ${message}`,
		decision: {
			mode: testCase.expectedOutputs.length > 0 ? "worker" : "direct",
			profileId: testCase.expectedProfileId,
			workerType: testCase.expectedProfileId,
			reason: "Smoke case failed before producing a result.",
		},
		sessionId: "academic-smoke",
		acceptanceReport: {
			taskId: testCase.id,
			accepted: false,
			checkedAt: new Date().toISOString(),
			issues: [{ code: "smoke_case_failed", message, severity: "error" }],
		},
	};
}

export async function runAcademicSmokeSuite(
	options: RunAcademicSmokeSuiteOptions = {},
): Promise<AcademicSmokeSuiteResult> {
	const fixtureDir = options.fixtureDir ?? defaultFixtureDir();
	const store = createStore(options);
	const workerRunner =
		options.workerRunner ?? (options.liveLiteratureSearch ? undefined : deterministicWorkerRunner(store));
	const tempCwd = options.artifactDir ? undefined : mkdtempSync(join(tmpdir(), "lead-agent-smoke-workspace-"));
	const runtime = createLeadAgentRuntime({
		cwd: tempCwd,
		artifactDir: options.artifactDir,
		artifactStore: store,
		workerRunner,
		directRunner: async (request) => `Direct smoke synthesis: ${request.objective}`,
		workflowPlanner: createAcademicSmokePlanner(),
	});
	const results: AcademicSmokeCaseResult[] = [];
	try {
		for (const testCase of DEFAULT_ACADEMIC_SMOKE_CASES) {
			const context = readFixtureContext(fixtureDir, testCase.fixtureFiles);
			let result: LeadAgentResult;
			try {
				result = await runtime.run({
					taskId: testCase.id,
					objective: testCase.objective,
					constraints: [`Fixture context:\n\n${context}`],
					expectedOutputs: testCase.expectedOutputs.length > 0 ? testCase.expectedOutputs : undefined,
				});
			} catch (error) {
				result = failedSmokeResult(testCase, error);
			}
			const failures = failuresForCase(testCase, result);
			results.push({
				caseId: testCase.id,
				result,
				failures,
				passed: failures.length === 0,
			});
		}
	} finally {
		if (tempCwd) {
			rmSync(tempCwd, { recursive: true, force: true });
		}
	}
	return {
		results,
		artifactRefs: store.manifest().artifacts,
		manifestPath: options.artifactDir ? join(options.artifactDir, "artifacts.json") : undefined,
		passed: results.every((result) => result.passed),
	};
}
