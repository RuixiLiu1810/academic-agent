import type {
	AcceptanceIssue,
	AcceptanceReport,
	ArtifactRef,
	JsonValue,
	WorkerRequest,
	WorkerResult,
} from "@mariozechner/pi-agent-contracts";
import { createAcceptanceReport } from "@mariozechner/pi-agent-contracts";

function normalizeForMatch(value: string): string {
	return value.trim().toLowerCase();
}

function textIncludesExpected(text: string, expected: string): boolean {
	const normalizedText = normalizeForMatch(text);
	const normalizedExpected = normalizeForMatch(expected);
	return normalizedExpected.length === 0 || normalizedText.includes(normalizedExpected);
}

function artifactMatchesExpected(artifact: ArtifactRef, expected: string): boolean {
	return [artifact.id, artifact.kind, artifact.uri, artifact.title ?? "", artifact.mediaType ?? ""].some((value) =>
		textIncludesExpected(value, expected),
	);
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
	for (const question of workerResult.openQuestions) {
		issues.push({
			code: "worker_open_question",
			message: question,
			severity: "info",
		});
	}
	return issues;
}

export function createLeadAcceptanceReport(workerRequest: WorkerRequest, workerResult: WorkerResult): AcceptanceReport {
	return createAcceptanceReport(workerResult, acceptanceIssuesForWorkerResult(workerRequest, workerResult));
}
