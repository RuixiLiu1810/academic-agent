import type { ArtifactBrief, WorkerResult, WorkflowPlan } from "@mariozechner/pi-agent-contracts";
import type { WorkflowExecutionResult } from "./executor.js";

function latestWorkerResult(execution: WorkflowExecutionResult): WorkerResult | undefined {
	for (let i = execution.stepResults.length - 1; i >= 0; i--) {
		const workerResult = execution.stepResults[i]?.workerResult;
		if (workerResult) {
			return workerResult;
		}
	}
	return undefined;
}

function renderArtifactBriefs(artifactBriefs: readonly ArtifactBrief[]): string {
	if (artifactBriefs.length === 0) {
		return "";
	}
	const lines = artifactBriefs.map((brief) => {
		const label = brief.title ?? brief.kind;
		return `- ${label}: ${brief.brief}`;
	});
	return `\n\nArtifacts:\n${lines.join("\n")}`;
}

export function synthesizeWorkflowFinalOutput(plan: WorkflowPlan, execution: WorkflowExecutionResult): string {
	const lastResult = latestWorkerResult(execution);
	if (!execution.accepted) {
		return `Worker result was not accepted: ${lastResult?.summary ?? plan.objective}`;
	}
	if (execution.stepResults.length <= 1) {
		return lastResult?.summary ?? plan.objective;
	}
	const summaries = execution.stepResults
		.map((stepResult) => stepResult.workerResult?.summary)
		.filter((summary): summary is string => Boolean(summary && summary.length > 0));
	return `${summaries.join("\n\n")}${renderArtifactBriefs(execution.artifactBriefs)}`;
}
