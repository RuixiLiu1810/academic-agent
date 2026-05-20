import type { ScenarioDefinition } from "./scenario-runner.js";

export interface ScenarioCoverageRow {
	id: string;
	title: string;
	runs: number;
	expectedMode?: string;
	expectedProfiles: string[];
	expectedTools: string[];
	expectedArtifactKinds: string[];
	expectedEvents: string[];
}

export function createScenarioCoverageRows(scenarios: readonly ScenarioDefinition[]): ScenarioCoverageRow[] {
	return scenarios.map((scenario) => ({
		id: scenario.id,
		title: scenario.title,
		runs: scenario.runs?.length ?? 1,
		expectedMode: scenario.expect?.mode,
		expectedProfiles: [
			...(scenario.expect?.profiles?.include ?? []),
			...(scenario.expect?.profiles?.includeAny ?? []),
		],
		expectedTools: scenario.expect?.tools?.include ?? [],
		expectedArtifactKinds: scenario.expect?.artifacts?.includeKinds ?? [],
		expectedEvents: [...(scenario.expect?.events?.include ?? []), ...(scenario.expect?.events?.includeOrdered ?? [])],
	}));
}

export function renderScenarioCoverageMarkdown(scenarios: readonly ScenarioDefinition[]): string {
	const rows = createScenarioCoverageRows(scenarios);
	const lines = [
		"| Scenario | Runs | Mode | Profiles | Tools | Artifacts | Events |",
		"| --- | ---: | --- | --- | --- | --- | --- |",
		...rows.map(
			(row) =>
				`| ${row.id} | ${row.runs} | ${row.expectedMode ?? ""} | ${row.expectedProfiles.join(", ")} | ${row.expectedTools.join(", ")} | ${row.expectedArtifactKinds.join(", ")} | ${row.expectedEvents.join(", ")} |`,
		),
	];
	return lines.join("\n");
}
