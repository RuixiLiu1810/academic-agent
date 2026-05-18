import type {
	AcceptanceIssue,
	AcceptanceReport,
	ArtifactRef,
	JsonValue,
	WorkerRequest,
	WorkerResult,
} from "@mariozechner/pi-agent-contracts";
import {
	createAcceptanceReport,
	type ExpectedWorkerOutput,
	legacyOutputsToContract,
	type OutputRequirement,
} from "@mariozechner/pi-agent-contracts";
import type { ArtifactStore } from "@mariozechner/pi-artifact-core";

function issue(
	code: string,
	message: string,
	severity: AcceptanceIssue["severity"],
	artifactId?: string,
): AcceptanceIssue {
	return { code, message, severity, artifactId };
}

function artifactMatchesKind(artifact: ArtifactRef, kind: string): boolean {
	return artifact.kind === kind;
}

function valueAtPath(value: JsonValue | undefined, path: string): JsonValue | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	let current: JsonValue | undefined = value;
	for (const part of path.split(".")) {
		if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
		current = current[part];
	}
	return current;
}

function issuesForRequirement(
	requirement: OutputRequirement,
	result: WorkerResult,
	artifactStore: Pick<ArtifactStore, "get"> | undefined,
): AcceptanceIssue[] {
	if (!requirement.required) return [];
	if (requirement.kind === "artifact") {
		const matches = result.producedArtifacts.filter((artifact) =>
			artifactMatchesKind(artifact, requirement.artifactKind),
		);
		if (matches.length < (requirement.minCount ?? 1)) {
			return [issue("artifact_missing", `Missing artifact kind: ${requirement.artifactKind}`, "error")];
		}
		if (!artifactStore || !requirement.schemaRef) return [];
		return matches.flatMap((artifact) => {
			const stored = artifactStore.get(artifact.id);
			if (!stored) {
				return [issue("artifact_unreadable", `Artifact not found: ${artifact.id}`, "error", artifact.id)];
			}
			try {
				JSON.parse(stored.content);
				return [];
			} catch {
				return [
					issue("artifact_unreadable", `Artifact content is not valid JSON: ${artifact.id}`, "error", artifact.id),
				];
			}
		});
	}
	if (requirement.kind === "structured") {
		const value = valueAtPath(result.structuredOutputs, requirement.path);
		return value === undefined
			? [issue("structured_output_missing", `Missing structured output at ${requirement.path}`, "error")]
			: [];
	}
	const text = result.summary.trim();
	if (text.length === 0) {
		return [issue("narrative_output_missing", `Missing narrative output: ${requirement.section}`, "error")];
	}
	if (requirement.minChars && text.length < requirement.minChars) {
		return [
			issue("narrative_output_too_short", `${requirement.section} shorter than ${requirement.minChars}`, "error"),
		];
	}
	for (const token of requirement.mustMention ?? []) {
		if (!text.toLowerCase().includes(token.toLowerCase())) {
			return [issue("narrative_output_missing_token", `${requirement.section} missing token: ${token}`, "error")];
		}
	}
	return [];
}

export function outputContractForRequest(request: WorkerRequest): ExpectedWorkerOutput {
	return request.outputContract ?? legacyOutputsToContract(request);
}

export function createLeadContractAcceptanceReport(
	request: WorkerRequest,
	result: WorkerResult,
	options: { artifactStore?: Pick<ArtifactStore, "get"> } = {},
): AcceptanceReport {
	const issues: AcceptanceIssue[] = [];
	if (result.status !== "success") {
		issues.push(issue("worker_failed", result.failureReason ?? `Worker returned status ${result.status}.`, "error"));
	}
	const contract = outputContractForRequest(request);
	for (const requirement of contract.requirements) {
		issues.push(...issuesForRequirement(requirement, result, options.artifactStore));
	}
	for (const warning of result.warnings) {
		issues.push(issue("worker_warning", warning, "warning"));
	}
	for (const question of result.openQuestions) {
		issues.push(issue("worker_open_question", question.question, "info"));
	}
	return createAcceptanceReport(result, issues);
}
