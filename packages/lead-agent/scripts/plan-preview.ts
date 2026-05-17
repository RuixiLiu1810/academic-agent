/**
 * Planner preview script — connect to the real LLM planner and print the workflow plan.
 *
 * Usage:
 *   npx tsx scripts/plan-preview.ts [--model <pattern>] [--provider <name>] <objective>
 *
 * Examples:
 *   npx tsx scripts/plan-preview.ts "帮我寻找一些关于NIR的文献"
 *   npx tsx scripts/plan-preview.ts --model claude-3-5-sonnet "Write a review on NIR spectroscopy"
 *   npx tsx scripts/plan-preview.ts --provider anthropic "帮我写一篇关于水稻基因编辑的综述"
 */

import chalk from "chalk";
import { createAgentHostServices } from "@mariozechner/pi-agent-host";
import {
	createLlmWorkflowPlanner,
	createLeadTaskPlanningInput,
	WORKFLOW_TEMPLATES,
	PlannerValidationError,
} from "../src/orchestration/index.js";
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
import type { LeadAgentModel } from "../src/index.js";
import type { ModelRegistry } from "@mariozechner/pi-agent-host";

// ── helpers ──────────────────────────────────────────────────────────────────

function resolveModel(
	modelRegistry: ModelRegistry,
	modelPattern?: string,
	provider?: string,
): LeadAgentModel | undefined {
	if (!modelPattern && !provider) return undefined;
	const available = modelRegistry.getAvailable();
	if (available.length === 0) return undefined;

	const pattern = modelPattern && provider ? `${provider}/${modelPattern}` : (modelPattern ?? provider ?? "");
	const lower = pattern.toLowerCase();

	const canonical = available.find((m) => `${m.provider}/${m.id}`.toLowerCase() === lower);
	if (canonical) return canonical;

	const pool = provider ? available.filter((m) => m.provider.toLowerCase() === provider.toLowerCase()) : available;
	const matches = pool.filter(
		(m) =>
			m.id.toLowerCase().includes(lower) ||
			`${m.provider}/${m.id}`.toLowerCase().includes(lower) ||
			(m.name ?? "").toLowerCase().includes(lower),
	);
	if (matches.length === 0) return undefined;
	const aliases = matches.filter((m) => !/-\d{8}$/.test(m.id));
	return aliases.length > 0 ? aliases[0] : matches[0];
}

function parseArgs(argv: string[]): { objective: string; model?: string; provider?: string } {
	const args = argv.slice(2); // strip node + script path
	let model: string | undefined;
	let provider: string | undefined;
	const objectiveParts: string[] = [];

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--model" && i + 1 < args.length) {
			model = args[++i];
		} else if (args[i] === "--provider" && i + 1 < args.length) {
			provider = args[++i];
		} else {
			objectiveParts.push(args[i]!);
		}
	}

	const objective = objectiveParts.join(" ").trim();
	return { objective, model, provider };
}

function renderPlan(plan: {
	mode: string;
	rationale: string;
	userVisibleSummary: string;
	steps: Array<{
		id: string;
		order: number;
		profileId: string;
		objective: string;
		expectedArtifactKinds?: string[];
		expectedOutputs?: string[];
		acceptanceCriteria?: string[];
	}>;
	stopConditions: string[];
}): void {
	const modeColor = plan.mode === "workflow" ? chalk.cyan : chalk.yellow;
	const sep = chalk.gray("─".repeat(60));

	process.stdout.write("\n");
	process.stdout.write(sep + "\n");
	process.stdout.write(chalk.bold("  WORKFLOW PLAN\n"));
	process.stdout.write(sep + "\n\n");

	process.stdout.write(chalk.bold("Mode:      ") + modeColor(plan.mode.toUpperCase()) + "\n");
	process.stdout.write(chalk.bold("Summary:   ") + plan.userVisibleSummary + "\n");
	process.stdout.write(chalk.bold("Rationale: ") + chalk.gray(plan.rationale) + "\n\n");

	if (plan.steps.length === 0) {
		process.stdout.write(chalk.yellow("  (No worker steps — lead agent handles directly)\n\n"));
	} else {
		for (const step of plan.steps) {
			process.stdout.write(
				chalk.bold(`  Step ${step.order}: `) +
					chalk.green(step.profileId) +
					chalk.gray(` [${step.id}]`) +
					"\n",
			);

			// Extract step objective only (after "Step objective:")
			const stepObjMatch = step.objective.match(/Step objective:\s*([\s\S]+)/);
			const displayObj = stepObjMatch ? stepObjMatch[1]!.trim() : step.objective;
			process.stdout.write("    " + chalk.italic(displayObj) + "\n");

			if (step.expectedArtifactKinds && step.expectedArtifactKinds.length > 0) {
				process.stdout.write(
					"    " +
						chalk.gray("artifacts: ") +
						step.expectedArtifactKinds.map((k) => chalk.magenta(k)).join(", ") +
						"\n",
				);
			}
			if (step.expectedOutputs && step.expectedOutputs.length > 0) {
				process.stdout.write(
					"    " +
						chalk.gray("outputs:   ") +
						step.expectedOutputs.map((o) => chalk.blue(o)).join(", ") +
						"\n",
				);
			}
			if (step.acceptanceCriteria && step.acceptanceCriteria.length > 0) {
				process.stdout.write(
					"    " + chalk.gray("accepts if:") + "\n",
				);
				for (const criterion of step.acceptanceCriteria) {
					process.stdout.write("      " + chalk.gray("• ") + criterion + "\n");
				}
			}
			process.stdout.write("\n");
		}
	}

	process.stdout.write(chalk.bold("Stop conditions:\n"));
	for (const cond of plan.stopConditions) {
		process.stdout.write("  " + chalk.gray("• ") + cond + "\n");
	}
	process.stdout.write("\n" + sep + "\n\n");
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const { objective, model: modelPattern, provider } = parseArgs(process.argv);

	if (!objective) {
		process.stderr.write(
			chalk.red("Error: objective is required.\n") +
				chalk.gray("Usage: npx tsx scripts/plan-preview.ts [--model <pattern>] <objective>\n"),
		);
		process.exit(1);
	}

	const services = await createAgentHostServices({ cwd: process.cwd() });
	const modelRegistry = services.modelRegistry;

	const resolvedModel = resolveModel(modelRegistry, modelPattern, provider);
	if (!resolvedModel) {
		if (modelPattern ?? provider) {
			const pattern = [provider, modelPattern].filter(Boolean).join("/");
			process.stderr.write(
				chalk.red(`No model found matching "${pattern}".\n`) +
					chalk.gray("Run: npx tsx scripts/plan-preview.ts --list-models\n"),
			);
			process.exit(1);
		}
		// No model given — show available models and exit
		const available = modelRegistry.getAvailable();
		if (available.length === 0) {
			process.stderr.write(
				chalk.red("No models available. Check your auth configuration.\n") +
					chalk.gray("Run: pi --login  (or set API key env vars)\n"),
			);
			process.exit(1);
		}
		process.stderr.write(
			chalk.yellow("No --model specified. Use one of:\n") +
				available
					.slice(0, 10)
					.map((m) => chalk.gray(`  --model ${m.id}  (${m.provider})`))
					.join("\n") +
				(available.length > 10 ? chalk.gray(`\n  ... and ${available.length - 10} more`) : "") +
				"\n\n" +
				chalk.gray("Example:\n") +
				chalk.gray(`  npx tsx scripts/plan-preview.ts --model ${available[0]!.id} "${objective}"\n`),
		);
		process.exit(1);
	}

	const profiles = DEFAULT_ACADEMIC_PROFILES;
	const planner = createLlmWorkflowPlanner({
		model: resolvedModel,
		templates: WORKFLOW_TEMPLATES,
		profiles,
	});

	process.stdout.write(chalk.bold("\nObjective: ") + chalk.white(objective) + "\n");
	process.stdout.write(chalk.gray(`Model:     ${resolvedModel.provider}/${resolvedModel.id}\n`));
	process.stdout.write(chalk.gray("Planning...\n"));

	const input = createLeadTaskPlanningInput({
		request: { objective },
		taskId: `plan-preview-${Date.now()}`,
		sessionId: `preview-session-${Date.now()}`,
		profiles,
	});

	try {
		const plan = await planner.plan(input);
		renderPlan(plan);
	} catch (e) {
		if (e instanceof PlannerValidationError) {
			process.stderr.write(chalk.red("\nPlanner failed after repair attempt.\n\n"));
			process.stderr.write(chalk.bold("First errors:\n"));
			for (const err of e.firstErrors) {
				process.stderr.write("  " + chalk.red("• ") + err + "\n");
			}
			process.stderr.write(chalk.bold("\nSecond errors:\n"));
			for (const err of e.secondErrors) {
				process.stderr.write("  " + chalk.red("• ") + err + "\n");
			}
			process.exit(1);
		}
		throw e;
	}
}

main().catch((e) => {
	process.stderr.write(chalk.red(`Error: ${e instanceof Error ? e.message : String(e)}\n`));
	process.exit(1);
});
