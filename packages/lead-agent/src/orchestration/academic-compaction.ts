import type { ArtifactRef, JsonObject } from "@mariozechner/pi-agent-contracts";
import type { SessionManager } from "@mariozechner/pi-agent-host";
import { buildLeadConversationContext } from "./lead-context.js";

export const ACADEMIC_COMPACTION_KIND = "lead-agent.academic-compaction";
export const ACADEMIC_COMPACTION_VERSION = "v1";

export interface AcademicCompactionResult {
	entryId: string;
	summary: string;
	details: JsonObject;
	retainedEntryId: string;
}

function artifactLineageFor(artifacts: readonly ArtifactRef[]): JsonObject[] {
	return artifacts.map((artifact) => ({
		artifactId: artifact.id,
		kind: artifact.kind,
		uri: artifact.uri,
		...(artifact.title ? { title: artifact.title } : {}),
		sourceArtifactIds: [],
	}));
}

function createAcademicCompactionDetails(sessionManager: SessionManager, currentObjective: string): JsonObject {
	const context = buildLeadConversationContext({
		sessionManager,
		currentObjective,
	});
	const acceptedWorkflowResults = context.recentWorkflowResults
		.filter((result) => result.accepted)
		.map((result) => ({
			taskId: result.taskId,
			accepted: result.accepted,
			producedArtifactKinds: result.producedArtifactKinds,
			issues: result.issues,
		}));
	const unresolvedIssues = context.recentWorkflowResults
		.filter((result) => !result.accepted)
		.flatMap((result) => result.issues);
	return {
		kind: ACADEMIC_COMPACTION_KIND,
		version: ACADEMIC_COMPACTION_VERSION,
		researchObjective: currentObjective,
		...(context.recentLeadOutputs.at(-1) ? { lastAcceptedFinalOutput: context.recentLeadOutputs.at(-1) } : {}),
		artifactLineage: artifactLineageFor(context.priorArtifacts),
		acceptedWorkflowResults,
		claimEvidenceMap: [],
		unresolvedIssues,
		openQuestions: [],
		retrievalGaps: [],
		pendingOutputContracts: [],
	};
}

function createAcademicCompactionSummary(details: JsonObject): string {
	const artifactLineage = Array.isArray(details.artifactLineage) ? details.artifactLineage : [];
	const acceptedWorkflowResults = Array.isArray(details.acceptedWorkflowResults)
		? details.acceptedWorkflowResults
		: [];
	const unresolvedIssues = Array.isArray(details.unresolvedIssues) ? details.unresolvedIssues : [];
	return [
		"Academic working memory compacted.",
		`Research objective: ${typeof details.researchObjective === "string" ? details.researchObjective : "unspecified"}`,
		`Retained artifacts: ${artifactLineage.length}`,
		`Accepted workflow results: ${acceptedWorkflowResults.length}`,
		`Unresolved issues: ${unresolvedIssues.length}`,
	].join("\n");
}

export function compactLeadAcademicSession(options: {
	sessionManager: SessionManager;
	currentObjective?: string;
}): AcademicCompactionResult {
	const branch = options.sessionManager.getBranch();
	const retainedEntry = branch.at(-1);
	if (!retainedEntry) {
		throw new Error("Cannot compact an empty lead-agent session.");
	}
	const currentObjective = options.currentObjective ?? "Continue academic workflow.";
	const details = createAcademicCompactionDetails(options.sessionManager, currentObjective);
	const summary = createAcademicCompactionSummary(details);
	const entryId = options.sessionManager.appendCompaction(
		summary,
		retainedEntry.id,
		JSON.stringify(details).length,
		details,
		true,
	);
	return {
		entryId,
		summary,
		details,
		retainedEntryId: retainedEntry.id,
	};
}
