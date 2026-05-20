import type {
	AcceptanceIssue,
	ArtifactBrief,
	ArtifactRef,
	JsonValue,
	WorkerResult,
	WorkflowPlan,
	WorkflowStepResult,
} from "@mariozechner/pi-agent-contracts";
import type { WorkflowExecutionResult } from "./executor.js";

const PLACEHOLDER_SUMMARY_PREFIX = "Generated placeholder structured output for plumbing validation";
const MACHINE_MARKER_KEYS = new Set(["runnerMode", "modelBacked", "verificationRequired"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function acceptedStepResults(execution: WorkflowExecutionResult): WorkflowStepResult[] {
	return execution.stepResults.filter(
		(stepResult) => stepResult.acceptanceReport?.accepted === true && stepResult.workerResult?.status === "success",
	);
}

function rejectedStepResults(execution: WorkflowExecutionResult): WorkflowStepResult[] {
	return execution.stepResults.filter(
		(stepResult) =>
			!(stepResult.acceptanceReport?.accepted === true && stepResult.workerResult?.status === "success"),
	);
}

function placeholderResult(workerResult: WorkerResult): boolean {
	if (isRecord(workerResult.structuredOutputs)) {
		if (workerResult.structuredOutputs.runnerMode === "placeholder-structured-runner") {
			return true;
		}
	}
	return workerResult.producedArtifacts.some(
		(artifact) => artifact.metadata?.runnerMode === "placeholder-structured-runner",
	);
}

function sanitizedSummary(workerResult: WorkerResult): string | undefined {
	if (placeholderResult(workerResult) || workerResult.summary.startsWith(PLACEHOLDER_SUMMARY_PREFIX)) {
		return undefined;
	}
	const trimmed = workerResult.summary.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizedJson(value: JsonValue | undefined): JsonValue | undefined {
	if (value === undefined || value === null) {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(sanitizedJson).filter((entry): entry is JsonValue => entry !== undefined);
	}
	if (typeof value !== "object") {
		return value;
	}
	const next: Record<string, JsonValue> = {};
	for (const [key, entryValue] of Object.entries(value)) {
		if (MACHINE_MARKER_KEYS.has(key)) {
			continue;
		}
		const sanitized = sanitizedJson(entryValue);
		if (sanitized !== undefined) {
			next[key] = sanitized;
		}
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

function structuredOutputSummary(workerResult: WorkerResult): string | undefined {
	const sanitized = sanitizedJson(workerResult.structuredOutputs);
	if (!isRecord(sanitized)) {
		return undefined;
	}
	const keys = Object.keys(sanitized);
	return keys.length > 0 ? keys.join(", ") : undefined;
}

function artifactLabel(artifact: ArtifactRef): string {
	const title = artifact.title ? `: ${artifact.title}` : "";
	return `${artifact.id} (${artifact.kind})${title}`;
}

function briefForArtifact(artifact: ArtifactRef, briefs: readonly ArtifactBrief[]): ArtifactBrief | undefined {
	return briefs.find((brief) => brief.artifactId === artifact.id);
}

function acceptedArtifacts(stepResults: readonly WorkflowStepResult[]): ArtifactRef[] {
	return stepResults.flatMap((stepResult) => stepResult.workerResult?.producedArtifacts ?? []);
}

function acceptedBriefs(stepResults: readonly WorkflowStepResult[]): ArtifactBrief[] {
	return stepResults.flatMap((stepResult) => stepResult.artifactBriefs);
}

function acceptedWarnings(stepResults: readonly WorkflowStepResult[]): string[] {
	return stepResults.flatMap((stepResult) => stepResult.workerResult?.warnings ?? []);
}

function acceptedIssues(stepResults: readonly WorkflowStepResult[]): AcceptanceIssue[] {
	return stepResults.flatMap((stepResult) => stepResult.acceptanceReport?.issues ?? []);
}

function rejectedLimitations(stepResults: readonly WorkflowStepResult[]): string[] {
	return stepResults.flatMap((stepResult) => {
		const issues = stepResult.acceptanceReport?.issues ?? [];
		const issueMessages = issues.map((issue) => issue.message);
		const failureReason = stepResult.workerResult?.failureReason;
		const reason = stepResult.decision.reason;
		return [...issueMessages, ...(failureReason ? [failureReason] : []), reason].filter(
			(message, index, messages): message is string =>
				typeof message === "string" && message.trim().length > 0 && messages.indexOf(message) === index,
		);
	});
}

function hasLiteratureArtifact(artifacts: readonly ArtifactRef[], briefs: readonly ArtifactBrief[]): boolean {
	return (
		artifacts.some((artifact) => artifact.kind === "literature-search-results") ||
		briefs.some((brief) => brief.kind === "literature-search-results")
	);
}

function renderAcceptedOutputBullets(stepResults: readonly WorkflowStepResult[]): string[] {
	return stepResults.flatMap((stepResult) => {
		const result = stepResult.workerResult;
		if (!result) {
			return [];
		}
		const summary = sanitizedSummary(result);
		const structured = structuredOutputSummary(result);
		const pieces = [
			summary ? `${stepResult.step.profileId}: ${summary}` : undefined,
			structured ? `${stepResult.step.profileId} structured outputs: ${structured}` : undefined,
		];
		return pieces.filter((piece): piece is string => piece !== undefined);
	});
}

function placeholderLimitation(stepResults: readonly WorkflowStepResult[]): string | undefined {
	return stepResults.some((stepResult) => stepResult.workerResult && placeholderResult(stepResult.workerResult))
		? "部分下游结构化分析目前为占位管线输出，尚未接入真实模型推理。"
		: undefined;
}

function renderBulletSection(title: string, values: readonly string[], fallback?: string): string {
	if (values.length === 0 && !fallback) {
		return "";
	}
	const bullets = values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : `- ${fallback}`;
	return `\n\n${title}\n${bullets}`;
}

function renderAcceptedArtifacts(artifacts: readonly ArtifactRef[], briefs: readonly ArtifactBrief[]): string[] {
	return artifacts.map((artifact) => {
		const brief = briefForArtifact(artifact, briefs);
		const briefText = brief ? ` - ${brief.brief}` : "";
		return `${artifactLabel(artifact)}${briefText}`;
	});
}

function renderLiteratureSynthesis(
	plan: WorkflowPlan,
	stepResults: readonly WorkflowStepResult[],
	rejectedSteps: readonly WorkflowStepResult[],
): string {
	const artifacts = acceptedArtifacts(stepResults);
	const briefs = acceptedBriefs(stepResults);
	const warnings = acceptedWarnings(stepResults);
	const issues = acceptedIssues(stepResults)
		.filter((issue) => issue.severity !== "info")
		.map((issue) => issue.message);
	const limitations = [
		...briefs.flatMap((brief) => brief.limitations ?? []),
		...warnings,
		...issues,
		...rejectedLimitations(rejectedSteps),
		placeholderLimitation(stepResults),
		"Artifact refs and briefs are pointers; no full artifact content was loaded, so this is not full-text screening.",
	].filter((item): item is string => Boolean(item && item.length > 0));
	const candidateOverview = [
		...briefs.map((brief) => `${brief.artifactId}: ${brief.brief}`),
		...briefs.flatMap((brief) => brief.keyFindings ?? []),
		...renderAcceptedOutputBullets(stepResults),
	];
	return [
		"Lead-level synthesis",
		`检索目标: ${plan.objective}`,
		renderBulletSection(
			"检索结果 artifact",
			renderAcceptedArtifacts(artifacts, briefs),
			"No accepted artifacts are available.",
		),
		renderBulletSection("候选结果概况", candidateOverview, "No accepted candidate overview is available."),
		renderBulletSection("检索缺口 / provider warnings", limitations),
		renderBulletSection("下一步建议", [
			"根据目标研究场景收窄关键词、数据库和纳入标准。",
			"在引用前读取全文并完成正式筛选。",
		]),
	].join("\n");
}

function renderGeneralSynthesis(
	plan: WorkflowPlan,
	stepResults: readonly WorkflowStepResult[],
	rejectedSteps: readonly WorkflowStepResult[],
): string {
	const artifacts = acceptedArtifacts(stepResults);
	const briefs = acceptedBriefs(stepResults);
	const limitations = [
		...acceptedWarnings(stepResults),
		...acceptedIssues(stepResults)
			.filter((issue) => issue.severity !== "info")
			.map((issue) => issue.message),
		...rejectedLimitations(rejectedSteps),
		placeholderLimitation(stepResults),
		artifacts.length > 0 || briefs.length > 0
			? "Artifact refs and briefs are pointers; no full artifact content was loaded unless explicitly provided."
			: undefined,
	].filter((item): item is string => Boolean(item && item.length > 0));
	return [
		"Lead-level synthesis",
		`Objective: ${plan.objective}`,
		renderBulletSection(
			"Accepted worker outputs",
			renderAcceptedOutputBullets(stepResults),
			"No accepted worker outputs are available yet.",
		),
		renderBulletSection(
			"Accepted artifacts",
			renderAcceptedArtifacts(artifacts, briefs),
			"No accepted artifacts are available.",
		),
		renderBulletSection("Limitations", limitations),
	].join("\n");
}

export function synthesizeWorkflowFinalOutput(plan: WorkflowPlan, execution: WorkflowExecutionResult): string {
	const acceptedSteps = acceptedStepResults(execution);
	const rejectedSteps = rejectedStepResults(execution);
	const artifacts = acceptedArtifacts(acceptedSteps);
	const briefs = acceptedBriefs(acceptedSteps);
	if (hasLiteratureArtifact(artifacts, briefs)) {
		return renderLiteratureSynthesis(plan, acceptedSteps, rejectedSteps);
	}
	return renderGeneralSynthesis(plan, acceptedSteps, rejectedSteps);
}
