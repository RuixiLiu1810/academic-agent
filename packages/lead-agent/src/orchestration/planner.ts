import type { WorkflowPlan } from "@mariozechner/pi-agent-contracts";
import type { LeadTaskPlanningInput, PlannerValidationContext, WorkflowPlanner } from "./types.js";

export function validateWorkflowPlan(plan: unknown, context: PlannerValidationContext): string[] {
	const errors: string[] = [];

	if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
		return ["Plan must be a non-null object"];
	}
	const p = plan as Record<string, unknown>;

	if (p.mode !== "direct" && p.mode !== "workflow") {
		errors.push(`Plan mode must be "direct" or "workflow", got ${JSON.stringify(p.mode)}`);
		return errors;
	}

	if (!Array.isArray(p.steps)) {
		errors.push("Plan steps must be an array");
		return errors;
	}

	if (!Array.isArray(p.stopConditions) || !(p.stopConditions as unknown[]).every((c) => typeof c === "string")) {
		errors.push("Plan stopConditions must be an array of strings");
	}

	const profileIds = new Set(context.profiles.map((profile) => profile.id));
	const inputArtifactIds = new Set(context.inputArtifacts.map((a) => a.id));
	const stepIds = new Set<string>();

	if (p.mode === "direct" && p.steps.length > 0) {
		errors.push("Direct workflow plans must not contain worker steps");
	}
	if (p.mode === "workflow" && p.steps.length === 0) {
		errors.push("Workflow plans must contain at least one step");
	}

	for (const step of p.steps as unknown[]) {
		if (!step || typeof step !== "object" || Array.isArray(step)) {
			errors.push("Each step must be a non-null object");
			continue;
		}
		const s = step as Record<string, unknown>;
		const stepId = typeof s.id === "string" ? s.id : "<unknown>";

		if (typeof s.id !== "string") {
			errors.push("Step missing string id");
		} else {
			if (stepIds.has(s.id)) {
				errors.push(`Duplicate workflow step id: ${s.id}`);
			}
			stepIds.add(s.id);
		}

		if (typeof s.profileId !== "string") {
			errors.push(`Step ${stepId}: missing string profileId`);
		} else if (!profileIds.has(s.profileId)) {
			errors.push(`Unknown workflow step profileId: ${s.profileId}`);
		}

		if (typeof s.order !== "number" || s.order < 1) {
			errors.push(`Workflow step ${stepId} has invalid order ${s.order}`);
		}

		if (typeof s.objective !== "string") {
			errors.push(`Step ${stepId}: objective must be a string`);
		} else {
			if (!s.objective.includes("User objective:")) {
				errors.push(`Step ${stepId}: objective missing "User objective:" section`);
			}
			if (!s.objective.includes("Step objective:")) {
				errors.push(`Step ${stepId}: objective missing "Step objective:" section`);
			}
			// Detect truncated objectives: "Step objective:" must be followed by non-whitespace content
			const stepObjMatch = s.objective.match(/Step objective:([\s\S]*)/);
			if (stepObjMatch && stepObjMatch[1]!.trim().length === 0) {
				errors.push(`Step ${stepId}: "Step objective:" section is empty or truncated`);
			}
		}

		if (!Array.isArray(s.inputArtifactRefs)) {
			errors.push(`Step ${stepId}: inputArtifactRefs must be an array`);
		} else {
			for (const ref of s.inputArtifactRefs as unknown[]) {
				if (ref && typeof ref === "object" && !Array.isArray(ref)) {
					const r = ref as Record<string, unknown>;
					if (typeof r.id === "string" && !inputArtifactIds.has(r.id)) {
						errors.push(`Step ${stepId}: inputArtifactRefs references unknown artifact id: ${r.id}`);
					}
				}
			}
		}

		if (
			!Array.isArray(s.expectedArtifactKinds) ||
			!(s.expectedArtifactKinds as unknown[]).every((k) => typeof k === "string")
		) {
			errors.push(`Step ${stepId}: expectedArtifactKinds must be an array of strings`);
		}

		if (!Array.isArray(s.expectedOutputs) || !(s.expectedOutputs as unknown[]).every((o) => typeof o === "string")) {
			errors.push(`Step ${stepId}: expectedOutputs must be an array of strings`);
		}

		if (
			!Array.isArray(s.acceptanceCriteria) ||
			!(s.acceptanceCriteria as unknown[]).every((c) => typeof c === "string")
		) {
			errors.push(`Step ${stepId}: acceptanceCriteria must be an array of strings`);
		}
	}

	return errors;
}

export function assertValidWorkflowPlan(
	plan: unknown,
	context: PlannerValidationContext,
): asserts plan is WorkflowPlan {
	const errors = validateWorkflowPlan(plan, context);
	if (errors.length > 0) {
		throw new Error(`Invalid workflow plan:\n${errors.map((error) => `- ${error}`).join("\n")}`);
	}
}

export function createFauxWorkflowPlanner(factory: (input: LeadTaskPlanningInput) => WorkflowPlan): WorkflowPlanner {
	return {
		async plan(input) {
			const plan = factory(input);
			assertValidWorkflowPlan(plan, {
				profiles: input.profiles,
				templates: [],
				inputArtifacts: input.inputArtifacts,
			});
			return plan;
		},
	};
}
