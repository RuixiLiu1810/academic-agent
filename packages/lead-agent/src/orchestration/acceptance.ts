import type {
	AcceptanceIssue,
	AcceptanceReport,
	ArtifactBrief,
	ArtifactRef,
	JsonValue,
	WorkerRequest,
	WorkerResult,
} from "@mariozechner/pi-agent-contracts";
import { createAcceptanceReport } from "@mariozechner/pi-agent-contracts";
import type { ArtifactStore } from "@mariozechner/pi-artifact-core";

export { createLeadContractAcceptanceReport, outputContractForRequest } from "./contract-acceptance.js";

import { createLeadContractAcceptanceReport } from "./contract-acceptance.js";

function normalizeForMatch(value: string): string {
	return value.trim().toLowerCase();
}

function normalizeSemanticLabel(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function normalizeOutputLabel(value: string): string {
	return normalizeSemanticLabel(value);
}

function requiresArtifactRef(expectedOutput: string): boolean {
	const normalized = normalizeOutputLabel(expectedOutput);
	return normalized === "literaturesearchresults" || normalized === "bibliographycandidates";
}

function textIncludesExpected(text: string, expected: string): boolean {
	const normalizedText = normalizeForMatch(text);
	const normalizedExpected = normalizeForMatch(expected);
	const semanticText = normalizeSemanticLabel(text);
	const semanticExpected = normalizeSemanticLabel(expected);
	return (
		normalizedExpected.length === 0 ||
		normalizedText.includes(normalizedExpected) ||
		(semanticExpected.length > 0 && semanticText.includes(semanticExpected))
	);
}

function artifactMatchesExpected(artifact: ArtifactRef, expected: string): boolean {
	return [artifact.id, artifact.kind, artifact.uri, artifact.title ?? "", artifact.mediaType ?? ""].some((value) =>
		textIncludesExpected(value, expected),
	);
}

function artifactBriefMatchesExpected(artifactBrief: ArtifactBrief, expected: string): boolean {
	return [
		artifactBrief.artifactId,
		artifactBrief.kind,
		artifactBrief.title ?? "",
		artifactBrief.brief,
		...(artifactBrief.keyFindings ?? []),
		...(artifactBrief.limitations ?? []),
	].some((value) => textIncludesExpected(value, expected));
}

function jsonValueMatchesExpected(value: JsonValue | undefined, expected: string): boolean {
	if (value === undefined || value === null) {
		return false;
	}
	if (typeof value === "string") {
		return textIncludesExpected(value, expected);
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return textIncludesExpected(String(value), expected);
	}
	if (Array.isArray(value)) {
		return value.some((item) => jsonValueMatchesExpected(item, expected));
	}
	return Object.entries(value).some(
		([key, item]) => textIncludesExpected(key, expected) || jsonValueMatchesExpected(item, expected),
	);
}

export function workerResultSatisfiesExpectedOutput(workerResult: WorkerResult, expectedOutput: string): boolean {
	return (
		textIncludesExpected(workerResult.summary, expectedOutput) ||
		workerResult.producedArtifacts.some((artifact) => artifactMatchesExpected(artifact, expectedOutput)) ||
		(workerResult.artifactBriefs ?? []).some((artifactBrief) =>
			artifactBriefMatchesExpected(artifactBrief, expectedOutput),
		) ||
		jsonValueMatchesExpected(workerResult.structuredOutputs, expectedOutput)
	);
}

export function acceptanceIssuesForWorkerResult(
	workerRequest: WorkerRequest,
	workerResult: WorkerResult,
): AcceptanceIssue[] {
	const issues: AcceptanceIssue[] = [];
	if (workerResult.status !== "success") {
		issues.push({
			code: "worker_failed",
			message: workerResult.failureReason ?? `Worker returned status ${workerResult.status}.`,
			severity: "error",
		});
	}
	for (const expectedOutput of workerRequest.expectedOutputs) {
		if (requiresArtifactRef(expectedOutput) && workerResult.producedArtifacts.length === 0) {
			issues.push({
				code: "expected_output_missing",
				message: `Worker result did not satisfy expected output: ${expectedOutput}`,
				severity: "error",
			});
			continue;
		}
		if (!workerResultSatisfiesExpectedOutput(workerResult, expectedOutput)) {
			issues.push({
				code: "expected_output_missing",
				message: `Worker result did not satisfy expected output: ${expectedOutput}`,
				severity: "error",
			});
		}
	}
	for (const warning of workerResult.warnings) {
		issues.push({
			code: "worker_warning",
			message: warning,
			severity: "warning",
		});
	}
	for (const q of workerResult.openQuestions) {
		issues.push({
			code: "worker_open_question",
			message: q.question,
			severity: "info",
		});
	}
	return issues;
}

export function createLeadAcceptanceReport(
	workerRequest: WorkerRequest,
	workerResult: WorkerResult,
	options: { artifactStore?: Pick<ArtifactStore, "get"> } = {},
): AcceptanceReport {
	if (workerRequest.outputContract) {
		return createLeadContractAcceptanceReport(workerRequest, workerResult, options);
	}
	return createAcceptanceReport(workerResult, acceptanceIssuesForWorkerResult(workerRequest, workerResult));
}
