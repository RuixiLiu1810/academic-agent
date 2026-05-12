import type { LeadAgentResult } from "../index.js";
import { createLeadSessionWorkspace } from "../orchestration/workspace.js";

export interface PersistedLeadCliArtifacts {
	finalOutputPath: string;
	resultJsonPath: string;
	acceptanceReportPath?: string;
	manifestPath: string;
}

export function persistLeadCliArtifacts(result: LeadAgentResult, artifactDir: string): PersistedLeadCliArtifacts {
	const workspace = createLeadSessionWorkspace({
		cwd: process.cwd(),
		sessionId: result.sessionId,
		artifactDir,
	});
	const finalOutputPath = workspace.writeFinalOutput(result.taskId, result.finalOutput);
	const resultJsonPath = workspace.writeTaskJson(result.taskId, "lead-result.json", result);
	const acceptanceReportPath = result.acceptanceReport
		? workspace.writeTaskJson(result.taskId, "acceptance-report.json", result.acceptanceReport)
		: undefined;
	workspace.store.create({
		kind: "lead-cli-result",
		title: "Lead agent final output",
		mediaType: "text/markdown",
		content: result.finalOutput,
		metadata: {
			taskId: result.taskId,
			sessionId: result.sessionId,
			decisionMode: result.decision.mode,
			profileId: result.decision.profileId ?? null,
		},
	});
	return {
		finalOutputPath,
		resultJsonPath,
		acceptanceReportPath,
		manifestPath: workspace.manifestPath,
	};
}
