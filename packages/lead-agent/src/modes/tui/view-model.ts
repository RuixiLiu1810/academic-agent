import type { LeadAgentRunView } from "../../cli/output.js";

export interface LeadTuiViewModel {
	header: string;
	resultLines: string[];
	issueLines: string[];
	artifactLines: string[];
	warningLines: string[];
	questionLines: string[];
}

function acceptedLabel(value: boolean | undefined): string {
	if (value === undefined) {
		return "direct";
	}
	return value ? "accepted" : "rejected";
}

function lines(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

export function createLeadTuiViewModel(view: LeadAgentRunView): LeadTuiViewModel {
	return {
		header: `${view.decision} | ${acceptedLabel(view.accepted)} | session ${view.sessionId}`,
		resultLines: lines(view.finalOutput),
		issueLines: view.issues.map((issue) => `${issue.severity} ${issue.code}: ${issue.message}`),
		artifactLines: view.artifacts.map((artifact) => `${artifact.kind} ${artifact.title ?? artifact.id}`),
		warningLines: view.warnings,
		questionLines: view.openQuestions,
	};
}
