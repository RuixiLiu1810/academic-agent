import type { WorkerProfile, WorkflowPlan } from "@mariozechner/pi-agent-contracts";
import type { LeadTaskPlanningInput, WorkflowPlanner } from "./types.js";

export function validateWorkflowPlan(plan: WorkflowPlan, profiles: readonly WorkerProfile[]): string[] {
	const errors: string[] = [];
	const profileIds = new Set(profiles.map((profile) => profile.id));
	const stepIds = new Set<string>();
	if (plan.mode === "direct" && plan.steps.length > 0) {
		errors.push("Direct workflow plans must not contain worker steps");
	}
	if (plan.mode === "workflow" && plan.steps.length === 0) {
		errors.push("Workflow plans must contain at least one step");
	}
	for (const step of plan.steps) {
		if (stepIds.has(step.id)) {
			errors.push(`Duplicate workflow step id: ${step.id}`);
		}
		stepIds.add(step.id);
		if (!profileIds.has(step.profileId)) {
			errors.push(`Unknown workflow step profileId: ${step.profileId}`);
		}
		if (step.order < 1) {
			errors.push(`Workflow step ${step.id} has invalid order ${step.order}`);
		}
	}
	return errors;
}

export function assertValidWorkflowPlan(plan: WorkflowPlan, profiles: readonly WorkerProfile[]): void {
	const errors = validateWorkflowPlan(plan, profiles);
	if (errors.length > 0) {
		throw new Error(`Invalid workflow plan:\n${errors.map((error) => `- ${error}`).join("\n")}`);
	}
}

export function createFauxWorkflowPlanner(factory: (input: LeadTaskPlanningInput) => WorkflowPlan): WorkflowPlanner {
	return {
		async plan(input) {
			const plan = factory(input);
			assertValidWorkflowPlan(plan, input.profiles);
			return plan;
		},
	};
}

export function createTemplateWorkflowPlanner(): WorkflowPlanner {
	return createFauxWorkflowPlanner((input) => {
		const template = input.templateCandidates[0];
		if (!template || template.steps.length === 0) {
			return {
				taskId: input.taskId,
				sessionId: input.sessionId,
				objective: input.objective,
				rationale: "The task is small enough for direct lead synthesis.",
				userVisibleSummary: "I will handle this directly.",
				mode: "direct",
				steps: [],
				stopConditions: ["Final answer produced"],
			};
		}
		return {
			taskId: input.taskId,
			sessionId: input.sessionId,
			objective: input.objective,
			rationale: `Template ${template.id} was selected and accepted by the planner.`,
			userVisibleSummary: `I will run ${template.title.toLowerCase()} and synthesize the accepted result.`,
			mode: "workflow",
			steps: template.steps.map((step, index) => ({
				...step,
				order: index + 1,
				inputArtifactRefs: input.inputArtifacts,
				expectedOutputs: input.expectedOutputs.length > 0 ? input.expectedOutputs : step.expectedOutputs,
			})),
			stopConditions: ["All planned steps are accepted"],
		};
	});
}
