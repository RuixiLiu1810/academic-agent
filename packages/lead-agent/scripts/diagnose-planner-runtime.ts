/**
 * Diagnose why the lead-agent runtime fails for a given objective.
 *
 * Unlike eval-planner.ts (which calls the LLM planner directly), this script
 * goes through the full createLeadAgentRuntime.run() path so it exercises
 * planner selection, planLeadAgentTask decision, and the catch block.
 *
 * Usage:
 *   npx tsx scripts/diagnose-planner-runtime.ts [--model <id>] "<objective>"
 *   npx tsx scripts/diagnose-planner-runtime.ts "搜索近五年一型糖尿病相关文献，做一个简单综述"
 *   npx tsx scripts/diagnose-planner-runtime.ts --model claude-sonnet-4.6 "搜索..."
 *   npx tsx scripts/diagnose-planner-runtime.ts --no-model "搜索..."   # force heuristic
 */

import chalk from "chalk";
import { createAgentHostServices } from "@mariozechner/pi-agent-host";
import type { ModelRegistry } from "@mariozechner/pi-agent-host";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { pathToFileURL } from "node:url";
import { createLeadAgentRuntime, type LeadAgentRunEvent, type LeadAgentModel } from "../src/index.js";

// ── helpers ──────────────────────────────────────────────────────────────────

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
	if (!envVar || process.env[envVar]) return;
	const key = await modelRegistry.getApiKeyForProvider(provider);
	if (key) process.env[envVar] = key;
}

function resolveModel(
	modelRegistry: ModelRegistry,
	modelPattern?: string,
	provider?: string,
): LeadAgentModel | undefined {
	if (!modelPattern && !provider) return undefined;
	const available = modelRegistry.getAvailable();
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
	const aliases = matches.filter((m) => !/-\d{8}$/.test(m.id));
	return aliases[0] ?? matches[0];
}

function parseArgs(argv: string[]): {
	objective: string;
	model?: string;
	provider?: string;
	noModel: boolean;
} {
	const args = argv.slice(2);
	let model: string | undefined;
	let provider: string | undefined;
	let noModel = false;
	const parts: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const a = args[i]!;
		if ((a === "--model" || a === "-m") && i + 1 < args.length) model = args[++i];
		else if ((a === "--provider" || a === "-p") && i + 1 < args.length) provider = args[++i];
		else if (a === "--no-model") noModel = true;
		else if (!a.startsWith("-")) parts.push(a);
	}
	return { objective: parts.join(" ").trim(), model, provider, noModel };
}

// ── CATEGORY CLASSIFICATION ───────────────────────────────────────────────────

function classifyReason(reason: string, repairAttempted: boolean): string {
	switch (reason) {
		case "no_tool_use_stop_reason":
			return "no tool call — model responded with text, not tool use";
		case "no_submit_workflow_plan_tool_call":
			return "no tool call — model called a different tool (not submit_workflow_plan)";
		case "multiple_submit_workflow_plan_tool_calls":
			return "bad tool call — multiple submit_workflow_plan calls in one response";
		case "missing_plan_arg":
			return "missing plan arg — tool args did not contain a 'plan' key";
		case "validation_failed":
			return repairAttempted ? "invalid plan validation — both first and repair calls failed" : "invalid plan validation — first call failed, repair not attempted";
		default:
			return reason;
	}
}

export function detectRoute(events: ReadonlyArray<Pick<LeadAgentRunEvent, "type">>): "workflow" | "direct" | "unknown" {
	if (events.some((event) => event.type === "workflow_start" || event.type === "worker_start")) {
		return "workflow";
	}
	if (events.some((event) => event.type === "synthesis_start")) {
		return "direct";
	}
	return "unknown";
}

export function didPlannerRecover(events: ReadonlyArray<Pick<LeadAgentRunEvent, "type">>): boolean {
	return events.some((event) => event.type === "planner_error") && events.some((event) => event.type === "planner_complete");
}

function isExecutedAsMain(argv: readonly string[] = process.argv, importMetaUrl: string = import.meta.url): boolean {
	const scriptPath = argv[1];
	return scriptPath !== undefined && pathToFileURL(scriptPath).href === importMetaUrl;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = parseArgs(process.argv);

	if (!args.objective) {
		process.stderr.write(
			chalk.bold("\ndiagnose-planner-runtime — reproduce planner failure via full runtime path\n\n") +
				chalk.bold("Usage:\n") +
				chalk.gray('  npx tsx scripts/diagnose-planner-runtime.ts [--model <id>] "<objective>"\n') +
				chalk.gray("  --no-model   force heuristic planner (no LLM)\n\n"),
		);
		process.exit(1);
	}

	const services = await createAgentHostServices({ cwd: process.cwd() });
	const modelRegistry = services.modelRegistry;

	let resolvedModel: LeadAgentModel | undefined;
	if (!args.noModel) {
		resolvedModel = resolveModel(modelRegistry, args.model, args.provider);
		if (!resolvedModel && (args.model ?? args.provider)) {
			const pat = [args.provider, args.model].filter(Boolean).join("/");
			process.stderr.write(chalk.red(`No model found matching "${pat}".\n`));
			process.exit(1);
		}
		if (resolvedModel) {
			await injectApiKey(modelRegistry, resolvedModel.provider);
		}
	}

	const bar = chalk.gray("━".repeat(64));
	const thin = chalk.gray("─".repeat(64));

	process.stdout.write("\n" + bar + "\n");
	process.stdout.write(chalk.bold("  diagnose-planner-runtime\n"));
	process.stdout.write(bar + "\n");
	process.stdout.write(chalk.bold("  Objective  ") + chalk.white(args.objective) + "\n");
	process.stdout.write(
		chalk.bold("  Model      ") +
			(resolvedModel
				? chalk.cyan(resolvedModel.provider) + chalk.gray("/") + chalk.cyan(resolvedModel.id)
				: chalk.yellow("(none — heuristic planner)")) +
			"\n",
	);
	process.stdout.write(thin + "\n\n");

	const runtime = createLeadAgentRuntime({
		cwd: process.cwd(),
		model: resolvedModel,
		// Stub workerRunner so the test exits immediately after planning phase
		workerRunner: async (ctx) => {
			return {
				taskId: ctx.taskId,
				status: "success" as const,
				summary: "[STUB] worker not run in diagnostic mode",
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace(`stub-${ctx.taskId}`),
			};
		},
	});

	const events: LeadAgentRunEvent[] = [];

	const result = await runtime.run({
		taskId: `diagnose-${Date.now()}`,
		objective: args.objective,
		onEvent: (event) => {
			events.push(event);
			const typeLabel = chalk.cyan(event.type.padEnd(30));
			process.stdout.write("  " + typeLabel);
			if ("taskId" in event) process.stdout.write(chalk.gray(` taskId=${event.taskId}`));
			process.stdout.write("\n");
		},
	});

	process.stdout.write("\n" + thin + "\n");

	// ── Planner error analysis ─────────────────────────────────────────────────
	const errorEvent = events.find((e) => e.type === "planner_error");
	const completeEvent = events.find((e) => e.type === "planner_complete");
	const route = detectRoute(events);
	const recovered = didPlannerRecover(events);
	if (errorEvent && errorEvent.type === "planner_error" && !completeEvent) {
		process.stdout.write(chalk.red.bold("  PLANNER FAILED\n") + thin + "\n");
		process.stdout.write(chalk.bold("  reason          ") + chalk.red(errorEvent.reason) + "\n");
		process.stdout.write(chalk.bold("  repairAttempted ") + (errorEvent.repairAttempted ? chalk.yellow("true") : chalk.gray("false")) + "\n");
		process.stdout.write(chalk.bold("  errorName       ") + chalk.gray(errorEvent.errorName) + "\n\n");
		process.stdout.write(chalk.bold("  Classification: ") + chalk.white(classifyReason(errorEvent.reason, errorEvent.repairAttempted)) + "\n\n");
		if (errorEvent.firstErrors.length > 0) {
			process.stdout.write(chalk.bold("  firstErrors\n"));
			for (const e of errorEvent.firstErrors) process.stdout.write("    " + chalk.red("✗ ") + e + "\n");
		}
		if (errorEvent.secondErrors.length > 0) {
			process.stdout.write("\n" + chalk.bold("  secondErrors\n"));
			for (const e of errorEvent.secondErrors) process.stdout.write("    " + chalk.red("✗ ") + e + "\n");
		}
		process.stdout.write("\n" + thin + "\n");
		process.stdout.write(chalk.bold("  Minimal fix suggestions:\n"));
		if (errorEvent.reason === "validation_failed") {
			const allErrors = [...errorEvent.firstErrors, ...errorEvent.secondErrors];
			const hasStepErrors = allErrors.some((e) => e.includes("profileId") || e.includes("Unknown workflow step"));
			const hasObjectiveErrors = allErrors.some((e) => e.includes("objective") || e.includes("User objective"));
			const hasEmptySteps = allErrors.some((e) => e.includes("at least one step") || e.includes("steps"));
			if (hasStepErrors) {
				process.stdout.write("    " + chalk.yellow("→") + " Model generated unknown profileId. Available profiles may not have been injected into the planner prompt.\n");
				process.stdout.write("    " + chalk.gray("  Check: createLlmWorkflowPlanner({ profiles }) receives DEFAULT_ACADEMIC_PROFILES.\n"));
			}
			if (hasObjectiveErrors) {
				process.stdout.write("    " + chalk.yellow("→") + " Step objective missing required 'User objective:' section header.\n");
				process.stdout.write("    " + chalk.gray("  Fix: strengthen few-shot example in buildRepairMessage / buildUserMessage.\n"));
			}
			if (hasEmptySteps) {
				process.stdout.write("    " + chalk.yellow("→") + " Model returned a plan with zero steps.\n");
				process.stdout.write("    " + chalk.gray("  Fix: add 'minimum one step required' to the tool description.\n"));
			}
			if (!hasStepErrors && !hasObjectiveErrors && !hasEmptySteps) {
				process.stdout.write("    " + chalk.yellow("→") + " Schema validation failed. Check the errors above and improve the planner system prompt examples.\n");
			}
		} else if (errorEvent.reason === "no_tool_use_stop_reason") {
			process.stdout.write("    " + chalk.yellow("→") + " Model did not call submit_workflow_plan. It responded with plain text.\n");
			process.stdout.write("    " + chalk.gray("  Fix: ensure tool_choice is set to 'required' or 'submit_workflow_plan' in completeSimple options.\n"));
		} else if (errorEvent.reason === "missing_plan_arg") {
			process.stdout.write("    " + chalk.yellow("→") + " Tool args did not contain a 'plan' key. Check tool schema matches what the model sends.\n");
		}
		process.stdout.write("\n");
		process.exit(1);
	} else {
		if (errorEvent && errorEvent.type === "planner_error" && recovered) {
			process.stdout.write(chalk.yellow.bold("  PLANNER RECOVERED\n") + thin + "\n");
			process.stdout.write(chalk.bold("  reason          ") + chalk.yellow(errorEvent.reason) + "\n");
			process.stdout.write(
				chalk.bold("  repairAttempted ") + (errorEvent.repairAttempted ? chalk.yellow("true") : chalk.gray("false")) + "\n",
			);
			process.stdout.write(chalk.bold("  errorName       ") + chalk.gray(errorEvent.errorName) + "\n");
			process.stdout.write(chalk.bold("  Classification: ") + chalk.white(classifyReason(errorEvent.reason, errorEvent.repairAttempted)) + "\n\n");
			process.stdout.write("  Heuristic fallback continued into execution.\n\n");
		}
		// No fatal planner_error — check planner_complete
		if (completeEvent) {
			process.stdout.write(chalk.green.bold("  PLANNER SUCCEEDED\n"));
			process.stdout.write(
				errorEvent ? "  planner_error was emitted, but execution recovered.\n" : "  No planner_error event emitted.\n",
			);
			process.stdout.write("  The '未能生成可执行的工作流计划' failure cannot be reproduced with this model/config.\n\n");
		} else {
			process.stdout.write(chalk.yellow("  No planner_complete event (may have gone direct mode).\n"));
		}
		if (route === "workflow") {
			process.stdout.write("  Route: " + chalk.cyan("workflow") + "\n");
		} else if (route === "direct") {
			process.stdout.write("  Route: " + chalk.cyan("direct synthesis") + " (no worker dispatch)\n");
		}
		process.stdout.write("\n  finalOutput preview: " + chalk.white(result.finalOutput.slice(0, 120)) + "\n\n");
	}
}

if (isExecutedAsMain()) {
	main().catch((e) => {
		process.stderr.write(chalk.red(`\nError: ${e instanceof Error ? e.message : String(e)}\n`));
		if (e instanceof Error && e.stack) process.stderr.write(chalk.gray(e.stack) + "\n");
		process.exit(1);
	});
}
