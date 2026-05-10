import { readFileSync } from "node:fs";
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

export interface AcademicSmokeCase {
	id: string;
	objective: string;
	fixtureFiles: string[];
	expectedProfileId?: string;
	expectedOutputs: string[];
	artifactKind?: string;
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
}

export const DEFAULT_ACADEMIC_SMOKE_CASES: AcademicSmokeCase[] = [
	{
		id: "direct-writing",
		objective: "Rewrite the manuscript background excerpt into concise academic Chinese without adding claims.",
		fixtureFiles: ["manuscript_excerpt.md"],
		expectedOutputs: [],
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
		expectedOutputs: ["review memo"],
		artifactKind: ACADEMIC_ARTIFACT_KINDS.reviewCommentMap,
	},
	{
		id: "mini-paperorchestra-inputs",
		objective: "Use the idea and experimental log to produce an evidence summary and outline.",
		fixtureFiles: ["idea.md", "experimental_log.md"],
		expectedProfileId: "researcher",
		expectedOutputs: ["evidence summary"],
		artifactKind: ACADEMIC_ARTIFACT_KINDS.evidenceTable,
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
				request.workerType === "citation-checker"
					? ACADEMIC_ARTIFACT_KINDS.claimAudit
					: request.workerType === "method-auditor"
						? ACADEMIC_ARTIFACT_KINDS.revisionPlan
						: request.workerType === "reviewer"
							? ACADEMIC_ARTIFACT_KINDS.reviewCommentMap
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
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace(`academic-smoke-${request.taskId}`),
		};
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
	if (result.acceptanceReport && !result.acceptanceReport.accepted) {
		failures.push(`acceptance rejected: ${result.acceptanceReport.issues.map((issue) => issue.code).join(", ")}`);
	}
	if (
		testCase.artifactKind &&
		!result.workerResult?.producedArtifacts.some((artifact) => artifact.kind === testCase.artifactKind)
	) {
		failures.push(`expected artifact kind ${testCase.artifactKind}`);
	}
	return failures;
}

export async function runAcademicSmokeSuite(
	options: RunAcademicSmokeSuiteOptions = {},
): Promise<AcademicSmokeSuiteResult> {
	const fixtureDir = options.fixtureDir ?? defaultFixtureDir();
	const store = createStore(options);
	const workerRunner = options.workerRunner ?? deterministicWorkerRunner(store);
	const runtime = createLeadAgentRuntime({
		workerRunner,
	});
	const results: AcademicSmokeCaseResult[] = [];
	for (const testCase of DEFAULT_ACADEMIC_SMOKE_CASES) {
		const context = readFixtureContext(fixtureDir, testCase.fixtureFiles);
		const result = await runtime.run({
			taskId: testCase.id,
			objective: testCase.objective,
			constraints: [`Fixture context:\n\n${context}`],
			expectedOutputs: testCase.expectedOutputs.length > 0 ? testCase.expectedOutputs : undefined,
		});
		const failures = failuresForCase(testCase, result);
		results.push({
			caseId: testCase.id,
			result,
			failures,
			passed: failures.length === 0,
		});
	}
	return {
		results,
		artifactRefs: store.manifest().artifacts,
		manifestPath: options.artifactDir ? join(options.artifactDir, "artifacts.json") : undefined,
		passed: results.every((result) => result.passed),
	};
}
