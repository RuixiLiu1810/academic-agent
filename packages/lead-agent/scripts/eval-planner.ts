/**
 * Planner evaluation script — feed an objective to the real LLM planner and
 * visualize the resulting workflow plan. No side effects, no session state.
 *
 * Auth note: API keys are resolved from ~/.pi/agent/auth.json via ModelRegistry
 * and injected into process.env so completeSimple can pick them up.
 *
 * Usage:
 *   npx tsx scripts/eval-planner.ts [--model <pattern>] [--provider <name>] <objective>
 *   npx tsx scripts/eval-planner.ts --list-models
 *
 * Examples:
 *   npx tsx scripts/eval-planner.ts "帮我寻找一些关于NIR的文献"
 *   npx tsx scripts/eval-planner.ts --model claude-sonnet-4.5 "Write a review on CRISPR"
 *   npx tsx scripts/eval-planner.ts --model gpt-4o "帮我整理水稻育种的最新研究进展"
 */

import chalk from "chalk";
import { createAgentHostServices } from "@mariozechner/pi-agent-host";
import type { ModelRegistry } from "@mariozechner/pi-agent-host";
import {
	createLlmWorkflowPlanner,
	createLeadTaskPlanningInput,
	WORKFLOW_TEMPLATES,
	PlannerValidationError,
} from "../src/orchestration/index.js";
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
import type { LeadAgentModel } from "../src/index.js";

// ── CLI args ──────────────────────────────────────────────────────────────────

interface Args {
	objective: string;
	model?: string;
	provider?: string;
	listModels: boolean;
}

function parseArgs(argv: string[]): Args {
	const args = argv.slice(2);
	let model: string | undefined;
	let provider: string | undefined;
	let listModels = false;
	const parts: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const a = args[i]!;
		if ((a === "--model" || a === "-m") && i + 1 < args.length) {
			model = args[++i];
		} else if ((a === "--provider" || a === "-p") && i + 1 < args.length) {
			provider = args[++i];
		} else if (a === "--list-models" || a === "-l") {
			listModels = true;
		} else if (!a.startsWith("-")) {
			parts.push(a);
		}
	}

	return { objective: parts.join(" ").trim(), model, provider, listModels };
}

// ── Model resolution ──────────────────────────────────────────────────────────

function resolveModel(
	modelRegistry: ModelRegistry,
	modelPattern?: string,
	provider?: string,
): LeadAgentModel | undefined {
	const available = modelRegistry.getAvailable();
	if (available.length === 0) return undefined;
	if (!modelPattern && !provider) return undefined;

	const pattern = modelPattern && provider ? `${provider}/${modelPattern}` : (modelPattern ?? provider ?? "");
	const lower = pattern.toLowerCase();

	const canonical = available.find((m) => `${m.provider}/${m.id}`.toLowerCase() === lower);
	if (canonical) return canonical;

	const pool = provider ? available.filter((m) => m.provider.toLowerCase() === provider.toLowerCase()) : available;
	const hits = pool.filter(
		(m) =>
			m.id.toLowerCase().includes(lower) ||
			`${m.provider}/${m.id}`.toLowerCase().includes(lower) ||
			(m.name ?? "").toLowerCase().includes(lower),
	);
	if (hits.length === 0) return undefined;
	const aliases = hits.filter((m) => !/-\d{8}$/.test(m.id));
	return aliases.length > 0 ? aliases[0] : hits[0];
}

// ── Auth injection ────────────────────────────────────────────────────────────
// completeSimple resolves API keys from env vars (e.g. COPILOT_GITHUB_TOKEN).
// ModelRegistry already has the token from auth.json, so we inject it here
// so the planner can pick it up without needing code changes elsewhere.

const PROVIDER_ENV_VARS: Record<string, string> = {
	"github-copilot": "COPILOT_GITHUB_TOKEN",
	anthropic: "ANTHROPIC_API_KEY",
	openai: "OPENAI_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
	google: "GEMINI_API_KEY",
	groq: "GROQ_API_KEY",
	xai: "XAI_API_KEY",
};

async function injectApiKey(modelRegistry: ModelRegistry, provider: string): Promise<void> {
	const envVar = PROVIDER_ENV_VARS[provider];
	if (!envVar) return;
	if (process.env[envVar]) return; // already set

	const key = await modelRegistry.getApiKeyForProvider(provider);
	if (key) {
		process.env[envVar] = key;
	}
}

// ── Rendering ─────────────────────────────────────────────────────────────────

type PlanShape = {
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
};

function renderPlan(plan: PlanShape): void {
	const isWorkflow = plan.mode === "workflow";
	const modeColor = isWorkflow ? chalk.cyan.bold : chalk.yellow.bold;
	const bar = chalk.gray("━".repeat(64));
	const thin = chalk.gray("─".repeat(64));

	process.stdout.write("\n" + bar + "\n");
	process.stdout.write(chalk.bold.white("  WORKFLOW PLAN\n"));
	process.stdout.write(bar + "\n\n");

	process.stdout.write(chalk.bold("  Mode      ") + modeColor(plan.mode.toUpperCase()) + "\n");
	process.stdout.write(chalk.bold("  Summary   ") + chalk.white(plan.userVisibleSummary) + "\n");
	process.stdout.write(chalk.bold("  Rationale ") + chalk.gray(plan.rationale) + "\n");

	if (plan.steps.length === 0) {
		process.stdout.write("\n" + chalk.yellow("  (No worker steps — lead agent handles directly)\n"));
	} else {
		process.stdout.write("\n" + thin + "\n");
		process.stdout.write(chalk.bold(`  Steps (${plan.steps.length})\n`) + thin + "\n\n");

		for (const step of plan.steps) {
			const num = chalk.bold.white(`  [${step.order}]`);
			const profile = chalk.green.bold(step.profileId);
			const id = chalk.gray(`#${step.id}`);
			process.stdout.write(`${num} ${profile} ${id}\n`);

			// Show only the "Step objective:" portion if present
			const match = step.objective.match(/Step objective:\s*([\s\S]+)/);
			const obj = match ? match[1]!.trim() : step.objective;
			const lines = obj.split("\n");
			for (const line of lines) {
				process.stdout.write("      " + chalk.italic(line) + "\n");
			}

			if (step.expectedArtifactKinds && step.expectedArtifactKinds.length > 0) {
				process.stdout.write(
					"      " +
						chalk.gray("artifacts : ") +
						step.expectedArtifactKinds.map((k) => chalk.magenta(k)).join(chalk.gray(", ")) +
						"\n",
				);
			}
			if (step.expectedOutputs && step.expectedOutputs.length > 0) {
				process.stdout.write(
					"      " +
						chalk.gray("outputs   : ") +
						step.expectedOutputs.map((o) => chalk.blue(o)).join(chalk.gray(", ")) +
						"\n",
				);
			}
			if (step.acceptanceCriteria && step.acceptanceCriteria.length > 0) {
				process.stdout.write("      " + chalk.gray("accepts if:\n"));
				for (const c of step.acceptanceCriteria) {
					process.stdout.write("        " + chalk.gray("▸ ") + chalk.dim(c) + "\n");
				}
			}
			process.stdout.write("\n");
		}
	}

	process.stdout.write(thin + "\n");
	process.stdout.write(chalk.bold("  Stop conditions\n") + thin + "\n");
	for (const cond of plan.stopConditions) {
		process.stdout.write("    " + chalk.gray("◆ ") + cond + "\n");
	}
	process.stdout.write("\n" + bar + "\n\n");
}

function renderModelList(modelRegistry: ModelRegistry, pattern?: string): void {
	const all = modelRegistry.getAvailable();
	const models = pattern
		? all.filter(
				(m) =>
					m.id.toLowerCase().includes(pattern.toLowerCase()) ||
					m.provider.toLowerCase().includes(pattern.toLowerCase()),
			)
		: all;

	if (models.length === 0) {
		process.stdout.write(chalk.yellow(`No models found${pattern ? ` matching "${pattern}"` : ""}.\n`));
		return;
	}

	const byProvider = new Map<string, typeof models>();
	for (const m of models) {
		if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
		byProvider.get(m.provider)!.push(m);
	}

	process.stdout.write(chalk.bold(`\nAvailable models (${models.length}):\n\n`));
	for (const [prov, ms] of byProvider) {
		process.stdout.write(chalk.bold.cyan(`  ${prov}\n`));
		for (const m of ms) {
			process.stdout.write(chalk.gray(`    --model ${m.id}\n`));
		}
		process.stdout.write("\n");
	}
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = parseArgs(process.argv);

	const services = await createAgentHostServices({ cwd: process.cwd() });
	const modelRegistry = services.modelRegistry;

	if (args.listModels) {
		renderModelList(modelRegistry, args.model ?? args.provider);
		return;
	}

	if (!args.objective) {
		const available = modelRegistry.getAvailable();
		const example = available[0]?.id ?? "claude-sonnet-4.5";
		process.stderr.write(
			chalk.bold("\neval-planner — test the LLM workflow planner\n\n") +
				chalk.bold("Usage:\n") +
				chalk.gray('  npx tsx scripts/eval-planner.ts [--model <id>] "<objective>"\n') +
				chalk.gray("  npx tsx scripts/eval-planner.ts --list-models\n\n") +
				chalk.bold("Examples:\n") +
				chalk.gray(`  npx tsx scripts/eval-planner.ts --model ${example} "帮我寻找NIR相关文献"\n`) +
				chalk.gray(`  npx tsx scripts/eval-planner.ts --model ${example} "Write a review on CRISPR"\n\n`),
		);
		process.exit(1);
	}

	// Resolve model
	const resolvedModel = resolveModel(modelRegistry, args.model, args.provider);
	if (!resolvedModel) {
		if (args.model ?? args.provider) {
			const pat = [args.provider, args.model].filter(Boolean).join("/");
			process.stderr.write(
				chalk.red(`No model found matching "${pat}".\n`) +
					chalk.gray("Run: npx tsx scripts/eval-planner.ts --list-models\n"),
			);
		} else {
			process.stderr.write(
				chalk.red("No models available. Check your auth (pi --login or set API key env vars).\n"),
			);
		}
		process.exit(1);
	}

	// Inject API key into env so completeSimple can find it
	await injectApiKey(modelRegistry, resolvedModel.provider);

	// Show header
	const bar = chalk.gray("━".repeat(64));
	process.stdout.write("\n" + bar + "\n");
	process.stdout.write(chalk.bold("  eval-planner\n"));
	process.stdout.write(bar + "\n");
	process.stdout.write(chalk.bold("  Objective  ") + chalk.white(args.objective) + "\n");
	process.stdout.write(
		chalk.bold("  Model      ") + chalk.cyan(resolvedModel.provider) + chalk.gray("/") + chalk.cyan(resolvedModel.id) + "\n",
	);
	process.stdout.write(chalk.gray("  Planning") + chalk.gray("...\n\n"));

	const profiles = DEFAULT_ACADEMIC_PROFILES;
	const planner = createLlmWorkflowPlanner({
		model: resolvedModel,
		templates: WORKFLOW_TEMPLATES,
		profiles,
	});

	const input = createLeadTaskPlanningInput({
		request: { objective: args.objective },
		taskId: `eval-${Date.now()}`,
		sessionId: `eval-session-${Date.now()}`,
		profiles,
	});

	try {
		const plan = await planner.plan(input);
		renderPlan(plan as PlanShape);
	} catch (e) {
		if (e instanceof PlannerValidationError) {
			const dt = e.debugTrace;
			const thin = chalk.gray("─".repeat(64));

			process.stderr.write(chalk.red.bold("\n  PLANNER FAILED\n"));
			process.stderr.write(thin + "\n");

			if (dt) {
				process.stderr.write(chalk.bold("  model          ") + chalk.cyan(`${dt.modelProvider}/${dt.modelId}`) + "\n");
				process.stderr.write(chalk.bold("  finalReason    ") + chalk.red(dt.finalFailureReason) + "\n");
				process.stderr.write(chalk.bold("  repairAttempted") + " " + (e.repairAttempted ? chalk.yellow("true") : chalk.gray("false")) + "\n");
				process.stderr.write("\n");

				for (const call of dt.calls) {
					process.stderr.write(chalk.bold(`  [${call.attempt}]\n`));
					process.stderr.write(`    modelCallStarted : ${call.modelCallStarted}\n`);
					process.stderr.write(`    stopReason       : ${call.stopReason ?? "(none)"}\n`);
					process.stderr.write(`    toolCallCount    : ${call.toolCallCount}\n`);
					process.stderr.write(`    toolCallNames    : [${call.toolCallNames.join(", ")}]\n`);
					process.stderr.write(`    failureReason    : ${chalk.yellow(call.failureReason)}\n`);
					if (call.rawTextPreview) {
						process.stderr.write(`    rawText(200)     : ${chalk.gray(call.rawTextPreview)}\n`);
					}
					if (call.rawToolArgsPreview) {
						process.stderr.write(`    toolArgs(300)    : ${chalk.gray(call.rawToolArgsPreview)}\n`);
					}
					if (call.parsedPlanPreview) {
						process.stderr.write(`    parsedPlan(300)  : ${chalk.gray(call.parsedPlanPreview)}\n`);
					}
					if (call.validationErrors.length > 0) {
						process.stderr.write(`    validationErrors :\n`);
						for (const ve of call.validationErrors) {
							process.stderr.write(`      ✗ ${chalk.red(ve)}\n`);
						}
					}
					process.stderr.write("\n");
				}

				process.stderr.write(thin + "\n");
				process.stderr.write(chalk.bold("  firstErrors\n"));
				for (const err of e.firstErrors) process.stderr.write("    " + chalk.red("✗ ") + err + "\n");
				process.stderr.write(chalk.bold("  secondErrors\n"));
				for (const err of e.secondErrors) process.stderr.write("    " + chalk.red("✗ ") + err + "\n");
			} else {
				// legacy (no debugTrace)
				process.stderr.write(chalk.bold("  firstErrors\n"));
				for (const err of e.firstErrors) process.stderr.write("    " + chalk.red("✗ ") + err + "\n");
				process.stderr.write(chalk.bold("  secondErrors\n"));
				for (const err of e.secondErrors) process.stderr.write("    " + chalk.red("✗ ") + err + "\n");
			}

			process.stderr.write("\n");
			process.exit(1);
		}
		throw e;
	}
}

main().catch((e) => {
	process.stderr.write(chalk.red(`\nError: ${e instanceof Error ? e.message : String(e)}\n`));
	process.exit(1);
});
