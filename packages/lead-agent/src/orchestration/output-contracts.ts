import type {
	ExpectedWorkerOutput,
	OutputRequirement,
	WorkerProfile,
	WorkflowStep,
} from "@mariozechner/pi-agent-contracts";

export function outputContractForStep(step: WorkflowStep, profile: WorkerProfile | undefined): ExpectedWorkerOutput {
	const artifactRequirements: OutputRequirement[] = step.expectedArtifactKinds.map((artifactKind) => ({
		kind: "artifact",
		id: artifactKind,
		label: artifactKind,
		required: true,
		artifactKind,
		minCount: 1,
	}));
	const narrativeRequirements: OutputRequirement[] = step.expectedOutputs
		.filter((label) => !step.expectedArtifactKinds.includes(label))
		.map((label) => ({
			kind: "narrative",
			id: label,
			label,
			required: true,
			section: label,
			mustMention: [label],
		}));
	return {
		contractId: `step:${step.profileId}:${step.id}`,
		profileId: profile?.id ?? step.profileId,
		successMode: "all-required",
		requirements: [...artifactRequirements, ...narrativeRequirements],
	};
}
