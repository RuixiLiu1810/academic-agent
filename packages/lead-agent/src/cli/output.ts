import type { ArtifactRef } from "@mariozechner/pi-agent-contracts";
import type { LeadAgentResult } from "../index.js";

export interface LeadAgentRunView {
	taskId: string;
	sessionId: string;
	decision: string;
	accepted?: boolean;
	planSummary?: string;
	finalOutput: string;
	issues: Array<{ severity: string; code: string; message: string }>;
	artifacts: ArtifactRef[];
	warnings: string[];
	openQuestions: string[];
	artifactManifestPath?: string;
}

export interface LeadAgentRunViewOptions {
	artifactManifestPath?: string;
}

export function createLeadAgentRunView(
	result: LeadAgentResult,
	options: LeadAgentRunViewOptions = {},
): LeadAgentRunView {
	const profileSuffix = result.decision.profileId ? `/${result.decision.profileId}` : "";
	const openQuestions = (result.workerResult?.openQuestions ?? []).map((q) => q.question);
	if (result.clarification?.question) {
		openQuestions.unshift(result.clarification.question);
	}
	return {
		taskId: result.taskId,
		sessionId: result.sessionId,
		decision: `${result.decision.mode}${profileSuffix}`,
		accepted: result.acceptanceReport?.accepted,
		planSummary: result.workflowPlan?.userVisibleSummary,
		finalOutput: result.finalOutput,
		issues: result.acceptanceReport?.issues ?? [],
		artifacts: result.workerResult?.producedArtifacts ?? [],
		warnings: result.workerResult?.warnings ?? [],
		openQuestions,
		artifactManifestPath: options.artifactManifestPath,
	};
}

function yesNo(value: boolean | undefined): string {
	if (value === undefined) {
		return "n/a";
	}
	return value ? "yes" : "no";
}

export function renderLeadAgentMarkdown(view: LeadAgentRunView): string {
	const lines = [
		"# Lead Agent Result",
		"",
		view.finalOutput,
		"",
		"## Run",
		"",
		`- Task: ${view.taskId}`,
		`- Session: ${view.sessionId}`,
		`- Decision: ${view.decision}`,
		`- Accepted: ${yesNo(view.accepted)}`,
	];
	if (view.planSummary) {
		lines.push(`- Plan summary: ${view.planSummary}`);
	}
	if (view.artifactManifestPath) {
		lines.push(`- Artifact manifest: ${view.artifactManifestPath}`);
	}
	if (view.issues.length > 0) {
		lines.push("", "## Acceptance Issues", "");
		for (const issue of view.issues) {
			lines.push(`- ${issue.severity}: ${issue.code}: ${issue.message}`);
		}
	}
	if (view.artifacts.length > 0) {
		lines.push("", "## Artifacts", "");
		for (const artifact of view.artifacts) {
			lines.push(`- ${artifact.kind}: ${artifact.title ?? artifact.id} (${artifact.uri})`);
		}
	}
	if (view.warnings.length > 0) {
		lines.push("", "## Warnings", "");
		for (const warning of view.warnings) {
			lines.push(`- ${warning}`);
		}
	}
	if (view.openQuestions.length > 0) {
		lines.push("", "## Open Questions", "");
		for (const question of view.openQuestions) {
			lines.push(`- ${question}`);
		}
	}
	return `${lines.join("\n")}\n`;
}

export function renderLeadAgentJson(view: LeadAgentRunView): string {
	return `${JSON.stringify(view, null, 2)}\n`;
}
