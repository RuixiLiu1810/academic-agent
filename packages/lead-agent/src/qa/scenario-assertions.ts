import type { ArtifactRef } from "@mariozechner/pi-agent-contracts";
import type { ScenarioDefinition, ScenarioTrace } from "./scenario-runner.js";

function eventTypes(trace: ScenarioTrace): string[] {
	return trace.runs.flatMap((run) => run.events.map((event) => event.type));
}

function finalOutputs(trace: ScenarioTrace): string[] {
	return trace.runs.map((run) => run.result.finalOutput);
}

function combinedFinalOutput(trace: ScenarioTrace): string {
	return finalOutputs(trace).join("\n");
}

function profileIds(trace: ScenarioTrace): Set<string> {
	const ids = new Set<string>();
	for (const run of trace.runs) {
		for (const step of run.result.workflowPlan?.steps ?? []) {
			ids.add(step.profileId);
		}
		for (const event of run.events) {
			if (
				event.type === "workflow_step_start" ||
				event.type === "workflow_step_retry" ||
				event.type === "workflow_step_complete" ||
				event.type === "worker_start" ||
				event.type === "worker_complete" ||
				event.type === "artifact_created" ||
				event.type === "acceptance_start" ||
				event.type === "acceptance_complete"
			) {
				ids.add(event.profileId);
			}
		}
	}
	return ids;
}

function artifactRefs(trace: ScenarioTrace): ArtifactRef[] {
	const artifacts = new Map<string, ArtifactRef>();
	for (const run of trace.runs) {
		for (const artifact of run.context.priorArtifacts) {
			artifacts.set(artifact.id, artifact);
		}
		for (const event of run.events) {
			if (event.type === "artifact_created") {
				artifacts.set(event.artifactId, {
					id: event.artifactId,
					kind: event.artifactKind,
					uri: `event://${event.artifactId}`,
					...(event.title ? { title: event.title } : {}),
				});
			}
		}
		const workerResult = run.result.workerResult;
		for (const artifact of workerResult?.producedArtifacts ?? []) {
			artifacts.set(artifact.id, artifact);
		}
	}
	return [...artifacts.values()];
}

function hasMode(trace: ScenarioTrace, mode: "direct" | "workflow" | "worker"): boolean {
	for (const run of trace.runs) {
		if (mode === "workflow" && run.result.workflowPlan?.mode === "workflow") {
			return true;
		}
		if (mode === "direct" && (run.result.workflowPlan?.mode === "direct" || run.result.decision.mode === "direct")) {
			return true;
		}
		if (mode === "worker" && run.result.decision.mode === "worker") {
			return true;
		}
	}
	return false;
}

function hasOrderedSubset(values: readonly string[], expected: readonly string[]): boolean {
	let cursor = -1;
	for (const value of expected) {
		const next = values.findIndex((entry, index) => index > cursor && entry === value);
		if (next === -1) {
			return false;
		}
		cursor = next;
	}
	return true;
}

function toolEvents(trace: ScenarioTrace, toolName: string): { start: boolean; complete: boolean } {
	let start = false;
	let complete = false;
	for (const run of trace.runs) {
		for (const event of run.events) {
			if (event.type === "tool_call_start" && event.toolName === toolName) {
				start = true;
			}
			if (event.type === "tool_call_complete" && event.toolName === toolName) {
				complete = true;
			}
		}
	}
	return { start, complete };
}

function rawWorkerSummaries(trace: ScenarioTrace): string[] {
	return trace.runs
		.map((run) => run.result.workerResult?.summary)
		.filter((summary): summary is string => typeof summary === "string" && summary.length > 0);
}

function structuredOutputText(trace: ScenarioTrace): string {
	return trace.runs.map((run) => JSON.stringify(run.result.workerResult?.structuredOutputs ?? null)).join("\n");
}

function addModeIssues(scenario: ScenarioDefinition, trace: ScenarioTrace, issues: string[]): void {
	const expectedMode = scenario.expect?.mode;
	if (expectedMode && !hasMode(trace, expectedMode)) {
		issues.push(`expected mode: ${expectedMode}`);
	}
}

function addProfileIssues(scenario: ScenarioDefinition, trace: ScenarioTrace, issues: string[]): void {
	const profiles = profileIds(trace);
	for (const profile of scenario.expect?.profiles?.include ?? []) {
		if (!profiles.has(profile)) {
			issues.push(`missing profile: ${profile}`);
		}
	}
	const includeAny = scenario.expect?.profiles?.includeAny ?? [];
	if (includeAny.length > 0 && !includeAny.some((profile) => profiles.has(profile))) {
		issues.push(`missing any profile: ${includeAny.join(", ")}`);
	}
	for (const profile of scenario.expect?.profiles?.exclude ?? []) {
		if (profiles.has(profile)) {
			issues.push(`excluded profile present: ${profile}`);
		}
	}
}

function addToolIssues(scenario: ScenarioDefinition, trace: ScenarioTrace, issues: string[]): void {
	for (const tool of scenario.expect?.tools?.include ?? []) {
		const events = toolEvents(trace, tool);
		if (!events.start || !events.complete) {
			issues.push(`missing tool: ${tool}`);
		}
	}
}

function addArtifactIssues(scenario: ScenarioDefinition, trace: ScenarioTrace, issues: string[]): void {
	const kinds = new Set(artifactRefs(trace).map((artifact) => artifact.kind));
	for (const kind of scenario.expect?.artifacts?.includeKinds ?? []) {
		if (!kinds.has(kind)) {
			issues.push(`missing artifact kind: ${kind}`);
		}
		const hasArtifactEvent = trace.runs.some((run) =>
			run.events.some((event) => event.type === "artifact_created" && event.artifactKind === kind),
		);
		if (!hasArtifactEvent) {
			issues.push(`missing artifact_created event for kind: ${kind}`);
		}
	}
}

function addEventIssues(scenario: ScenarioDefinition, trace: ScenarioTrace, issues: string[]): void {
	const types = eventTypes(trace);
	for (const eventType of scenario.expect?.events?.include ?? []) {
		if (!types.includes(eventType)) {
			issues.push(`missing event: ${eventType}`);
		}
	}
	const ordered = scenario.expect?.events?.includeOrdered ?? [];
	if (ordered.length > 0 && !hasOrderedSubset(types, ordered)) {
		issues.push(`missing ordered event sequence: ${ordered.join(" -> ")}`);
	}
	if (!types.includes("session_memory_updated")) {
		issues.push("missing event: session_memory_updated");
	}
}

function addFinalOutputIssues(scenario: ScenarioDefinition, trace: ScenarioTrace, issues: string[]): void {
	const output = combinedFinalOutput(trace);
	for (const phrase of scenario.expect?.finalOutput?.mustInclude ?? []) {
		if (!output.includes(phrase)) {
			issues.push(`missing final output phrase: ${phrase}`);
		}
	}
	const includeAny = scenario.expect?.finalOutput?.mustIncludeAny ?? [];
	if (includeAny.length > 0 && !includeAny.some((phrase) => output.includes(phrase))) {
		issues.push(`missing any final output phrase: ${includeAny.join(", ")}`);
	}
	for (const phrase of scenario.expect?.finalOutput?.mustNotInclude ?? []) {
		if (output.includes(phrase)) {
			issues.push(`forbidden final output phrase: ${phrase}`);
		}
	}
	if (scenario.expect?.finalOutput?.mustNotEqualRawWorkerSummary === true) {
		for (const [index, finalOutput] of finalOutputs(trace).entries()) {
			if (rawWorkerSummaries(trace).includes(finalOutput)) {
				issues.push(`final output equals raw worker summary on run ${index + 1}`);
			}
		}
	}
}

function addTraceIssues(scenario: ScenarioDefinition, trace: ScenarioTrace, issues: string[]): void {
	const structured = structuredOutputText(trace);
	for (const marker of scenario.expect?.trace?.structuredOutputsInclude ?? []) {
		if (!structured.includes(marker)) {
			issues.push(`missing structured output marker: ${marker}`);
		}
	}
}

function addMemoryIssues(scenario: ScenarioDefinition, trace: ScenarioTrace, issues: string[]): void {
	if (scenario.expect?.memory?.availableArtifactRefsIncludePreviousRun !== true) {
		return;
	}
	if (trace.runs.length < 2) {
		issues.push("memory assertion requires at least two runs");
		return;
	}
	const firstRunArtifacts = new Set(artifactRefs({ ...trace, runs: [trace.runs[0]!] }).map((artifact) => artifact.id));
	const secondRunRefs = new Set(trace.runs[1]!.availableArtifactRefs.map((artifact) => artifact.id));
	for (const artifactId of firstRunArtifacts) {
		if (!secondRunRefs.has(artifactId)) {
			issues.push(`missing previous artifact in availableArtifactRefs: ${artifactId}`);
		}
	}
}

function addSessionIssues(scenario: ScenarioDefinition, trace: ScenarioTrace, issues: string[]): void {
	if (scenario.expect?.session?.noDuplicateUserAssistantMessages !== true) {
		return;
	}
	for (const run of trace.runs) {
		const expected = run.index + 1;
		if (run.sessionMessageCounts.user !== expected || run.sessionMessageCounts.assistant !== expected) {
			issues.push(
				`duplicate session messages at run ${run.index + 1}: user=${run.sessionMessageCounts.user}, assistant=${run.sessionMessageCounts.assistant}`,
			);
		}
	}
}

export function collectScenarioIssues(scenario: ScenarioDefinition, trace: ScenarioTrace): string[] {
	const issues: string[] = [];
	addModeIssues(scenario, trace, issues);
	addProfileIssues(scenario, trace, issues);
	addToolIssues(scenario, trace, issues);
	addArtifactIssues(scenario, trace, issues);
	addEventIssues(scenario, trace, issues);
	addFinalOutputIssues(scenario, trace, issues);
	addTraceIssues(scenario, trace, issues);
	addMemoryIssues(scenario, trace, issues);
	addSessionIssues(scenario, trace, issues);
	return issues;
}

export function assertScenarioTrace(scenario: ScenarioDefinition, trace: ScenarioTrace): void {
	const issues = collectScenarioIssues(scenario, trace);
	if (issues.length > 0) {
		throw new Error(`Scenario ${scenario.id} failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
	}
}
