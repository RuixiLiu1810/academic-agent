# Agent Boundary Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `agent-host`, `coding-agent`, and `lead-agent` have enforceable ownership boundaries, with generic host runtime living in `agent-host`, academic orchestration living in `lead-agent`, and tool-execution worker behavior living in `coding-agent`.

**Architecture:** `agent-host` owns reusable runtime/session/resource/extension infrastructure and has no dependency on `coding-agent` or `lead-agent`. `coding-agent` composes `agent-host` with coding tools, CLI/TUI/RPC behavior, HTML export, and worker adapter. `lead-agent` composes `agent-host` with academic planning, profiles, acceptance, synthesis, and dispatches coding work only through a narrow worker gateway.

**Tech Stack:** TypeScript ESM packages, npm workspaces, Vitest, `@mariozechner/pi-agent-host`, `@mariozechner/pi-agent-contracts`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-lead-agent`.

---

## Boundary Decisions To Confirm

Confirmed decisions:

1. Do not preserve old host-level `@mariozechner/pi-coding-agent` compatibility exports. Migrate internal imports directly to `agent-host` and delete host-owned files from `coding-agent`.
2. Add a narrow `@mariozechner/pi-coding-agent/worker` subpath and make `lead-agent` import only that worker API, not the full coding-agent package root.
3. Do not preserve coding-agent extension-loader compatibility for extensions that import `@mariozechner/pi-coding-agent`. Generic extension loading belongs in `agent-host`; coding-agent keeps only product-owned tools, modes, and worker behavior.
4. Do not move academic task parsing into `agent-host`; `lead-agent` owns task semantics, planner/router, profile choice, acceptance, and final synthesis.

## Target Ownership

### `packages/agent-host`

Owns:
- `AgentSession`, `AgentSessionRuntime`, session services, `SessionManager`
- settings/auth/model registry/resource loading
- extension runtime/loader types and generic loader implementation
- prompt templates, skills, project context loading
- generic keybindings, diagnostics, output guard, shell/exec utilities
- host API injection points for product tools, product module bindings, HTML exporter

Must not import:
- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-lead-agent`
- `packages/coding-agent`
- `packages/lead-agent`

### `packages/coding-agent`

Owns:
- coding tools under `src/core/tools/*`
- coding prompt defaults and model resolver
- CLI/TUI/RPC/print modes and `pi` binary
- coding HTML export and coding tool renderers
- `runCodingWorker()` and worker prompt/result parsing

Should not own:
- session persistence implementation
- generic runtime/session switching
- generic extension runner/loader implementation
- generic resource loader implementation
- generic compaction implementation

### `packages/lead-agent`

Owns:
- academic task request schema at product level
- intake/planner/router/acceptance/synthesis
- academic profiles
- CLI/TUI academic user entry
- worker dispatch gateway
- academic smoke workflow

Should not own:
- coding tools
- generic host runtime implementation
- direct import of coding-agent package root

## File Structure

### Files created

- `packages/agent-host/test/boundary.test.ts`: asserts host has no product imports.
- `packages/coding-agent/test/suite/architecture/core-host-boundary.test.ts`: asserts host-owned files are absent from coding-agent and approved implementation files remain explicit.
- `packages/lead-agent/test/boundary.test.ts`: asserts lead imports only the worker gateway, not coding-agent root.
- `packages/coding-agent/src/worker.ts`: narrow worker public subpath.
- `packages/lead-agent/src/workers/coding-worker-dispatcher.ts`: lead-side gateway to coding worker.

### Files modified

- `packages/agent-host/package.json`: expose host subpaths needed by direct product imports.
- `packages/agent-host/src/index.ts`: export new host injection types.
- `packages/agent-host/src/agent-session-services.ts`: accept product tool definitions, bash operations, and HTML exporter injection.
- `packages/coding-agent/package.json`: add `./worker` export and remove dependency on local host implementations.
- `packages/coding-agent/src/core/sdk.ts`: become a coding-specific composer over `agent-host`.
- Delete host-owned files from `packages/coding-agent/src/core` after all internal imports point at `agent-host`.
- `packages/lead-agent/src/index.ts`: remove direct `runCodingWorker` root import.
- `packages/lead-agent/package.json`: depend on the worker subpath through package exports.
- `packages/*/CHANGELOG.md`: record boundary migration under `[Unreleased]`.

## Task 1: Add Boundary Regression Tests

**Files:**
- Create: `packages/agent-host/test/boundary.test.ts`
- Create: `packages/coding-agent/test/suite/architecture/core-host-boundary.test.ts`
- Create: `packages/lead-agent/test/boundary.test.ts`

- [ ] **Step 1: Write `agent-host` product import boundary test**

Create `packages/agent-host/test/boundary.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { globSync } from "glob";

const repoRoot = new URL("../../..", import.meta.url);

describe("agent-host package boundary", () => {
	it("does not import product packages", () => {
		const sourceFiles = globSync("packages/agent-host/src/**/*.ts", {
			cwd: repoRoot,
			absolute: true,
		});
		const forbidden = [
			"@mariozechner/pi-coding-agent",
			"@mariozechner/pi-lead-agent",
			"packages/coding-agent",
			"packages/lead-agent",
		];
		const violations = sourceFiles.flatMap((filePath) => {
			const text = readFileSync(filePath, "utf8");
			return forbidden
				.filter((token) => text.includes(token))
				.map((token) => `${relative(new URL("../..", import.meta.url).pathname, filePath)} contains ${token}`);
		});

		expect(violations).toEqual([]);
	});
});
```

- [ ] **Step 2: Run `agent-host` boundary test and verify it fails only if a product import exists**

Run from `packages/agent-host`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/boundary.test.ts
```

Expected: PASS if current host has no product imports. If it fails, the output must list the exact product import to remove before continuing.

- [ ] **Step 3: Write `coding-agent` host shim boundary test**

Create `packages/coding-agent/test/suite/architecture/core-host-shims.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = new URL("../../..", import.meta.url).pathname;

const expectedShims = new Map<string, string>([
	["src/core/agent-session.ts", 'export * from "@mariozechner/pi-agent-host/agent-session";\n'],
	["src/core/agent-session-runtime.ts", 'export * from "@mariozechner/pi-agent-host/agent-session-runtime";\n'],
	["src/core/bash-executor.ts", 'export * from "@mariozechner/pi-agent-host/bash-executor";\n'],
	["src/core/diagnostics.ts", 'export * from "@mariozechner/pi-agent-host/diagnostics";\n'],
	["src/core/footer-data-provider.ts", 'export * from "@mariozechner/pi-agent-host/footer-data-provider";\n'],
	["src/core/keybindings.ts", 'export * from "@mariozechner/pi-agent-host/keybindings";\n'],
	["src/core/output-guard.ts", 'export * from "@mariozechner/pi-agent-host/output-guard";\n'],
	["src/core/slash-commands.ts", 'export * from "@mariozechner/pi-agent-host/slash-commands";\n'],
	["src/core/system-prompt.ts", 'export * from "@mariozechner/pi-agent-host/system-prompt";\n'],
	["src/core/extensions/index.ts", 'export * from "@mariozechner/pi-agent-host/extensions";\n'],
	["src/core/extensions/runner.ts", 'export * from "@mariozechner/pi-agent-host/extensions";\n'],
	["src/core/extensions/types.ts", 'export * from "@mariozechner/pi-agent-host/extensions";\n'],
	["src/core/extensions/wrapper.ts", 'export * from "@mariozechner/pi-agent-host/extensions";\n'],
]);

describe("coding-agent host boundary", () => {
	it("keeps migrated host modules as compatibility shims", () => {
		const mismatches = [...expectedShims].flatMap(([relativePath, expected]) => {
			const actual = readFileSync(join(packageRoot, relativePath), "utf8");
			return actual === expected ? [] : [`${relativePath} is not the expected host shim`];
		});

		expect(mismatches).toEqual([]);
	});
});
```

- [ ] **Step 4: Run `coding-agent` shim test and verify it fails before migration**

Run from `packages/coding-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/architecture/core-host-shims.test.ts
```

Expected before migration: FAIL listing files such as `src/core/agent-session.ts` and `src/core/extensions/types.ts`.

- [ ] **Step 5: Write `lead-agent` worker import boundary test**

Create `packages/lead-agent/test/boundary.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { globSync } from "glob";

const packageRoot = new URL("..", import.meta.url);

describe("lead-agent package boundary", () => {
	it("imports coding-agent only through the worker gateway", () => {
		const sourceFiles = globSync("src/**/*.ts", {
			cwd: packageRoot,
			absolute: true,
		});
		const violations = sourceFiles.flatMap((filePath) => {
			const text = readFileSync(filePath, "utf8");
			const importsRoot = text.includes('from "@mariozechner/pi-coding-agent"');
			const isGateway = relative(packageRoot.pathname, filePath) === "src/workers/coding-worker-dispatcher.ts";
			const importsWorker = text.includes('from "@mariozechner/pi-coding-agent/worker"');
			if (importsRoot) return [`${relative(packageRoot.pathname, filePath)} imports coding-agent root`];
			if (importsWorker && !isGateway) return [`${relative(packageRoot.pathname, filePath)} bypasses worker gateway`];
			return [];
		});

		expect(violations).toEqual([]);
	});
});
```

- [ ] **Step 6: Run `lead-agent` boundary test and verify it fails before gateway migration**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/boundary.test.ts
```

Expected before migration: FAIL because `src/index.ts` imports `runCodingWorker` from `@mariozechner/pi-coding-agent`.

- [ ] **Step 7: Commit boundary tests**

```bash
git add packages/agent-host/test/boundary.test.ts
git add packages/coding-agent/test/suite/architecture/core-host-shims.test.ts
git add packages/lead-agent/test/boundary.test.ts
git commit -m "test: add agent package boundary checks"
```

## Task 2: Add Host Injection Points Needed By Products

**Files:**
- Modify: `packages/agent-host/src/agent-session-services.ts`
- Modify: `packages/agent-host/src/resource-loader-impl.ts`
- Modify: `packages/agent-host/src/resource-loader.ts`
- Modify: `packages/agent-host/src/extensions/loader.ts`
- Modify: `packages/agent-host/src/extensions/types.ts`
- Modify: `packages/agent-host/src/index.ts`
- Modify: `packages/agent-host/package.json`
- Modify: `packages/agent-host/test/exports.test.ts`

- [ ] **Step 1: Add product tool and exporter injection options**

In `packages/agent-host/src/agent-session-services.ts`, extend `CreateAgentSessionFromServicesOptions` with these fields:

```ts
	baseToolDefinitionsOverride?: Record<string, ToolDefinition>;
	baseToolsOverride?: Record<string, AgentTool>;
	createDefaultBashOperations?: AgentSessionConfig["createDefaultBashOperations"];
	htmlExporter?: AgentSessionConfig["htmlExporter"];
```

Add this import at the top:

```ts
import type { AgentTool } from "@mariozechner/pi-agent-core";
```

Change the `new AgentSession({ ... })` call to pass the fields through:

```ts
	const session = new AgentSession({
		agent,
		sessionManager: options.sessionManager,
		settingsManager: options.services.settingsManager,
		cwd: options.services.cwd,
		scopedModels: options.scopedModels,
		resourceLoader: options.services.resourceLoader,
		customTools: options.customTools,
		modelRegistry: options.services.modelRegistry,
		initialActiveToolNames,
		allowedToolNames,
		extensionRunnerRef,
		sessionStartEvent: options.sessionStartEvent,
		baseToolDefinitionsOverride: options.baseToolDefinitionsOverride,
		baseToolsOverride: options.baseToolsOverride,
		createDefaultBashOperations: options.createDefaultBashOperations,
		htmlExporter: options.htmlExporter,
	});
```

- [ ] **Step 2: Add extension module binding type**

In `packages/agent-host/src/extensions/types.ts`, add:

```ts
export interface ExtensionModuleBinding {
	specifier: string;
	module: unknown;
	aliasPath?: string;
}
```

- [ ] **Step 3: Thread extension module bindings through the host loader**

In `packages/agent-host/src/extensions/loader.ts`, import the type:

```ts
import type { ExtensionModuleBinding } from "./types.js";
```

Add a loader options type:

```ts
export interface LoadExtensionsOptions {
	moduleBindings?: ExtensionModuleBinding[];
}
```

Change `loadExtensions` to accept options:

```ts
export async function loadExtensions(
	extensionPaths: string[],
	cwd: string,
	eventBus?: EventBus,
	options: LoadExtensionsOptions = {},
): Promise<LoadExtensionsResult> {
```

When constructing `virtualModules`, merge product bindings:

```ts
	const virtualModules: Record<string, unknown> = { ...VIRTUAL_MODULES };
	for (const binding of options.moduleBindings ?? []) {
		virtualModules[binding.specifier] = binding.module;
	}
```

Use `virtualModules` in the `createJiti` call instead of `VIRTUAL_MODULES`.

When constructing aliases, merge `aliasPath` values:

```ts
	const aliases = { ...getAliases() };
	for (const binding of options.moduleBindings ?? []) {
		if (binding.aliasPath) {
			aliases[binding.specifier] = binding.aliasPath;
		}
	}
```

Use `aliases` in the `createJiti` call instead of `getAliases()`.

- [ ] **Step 4: Add resource loader option for extension module bindings**

In `packages/agent-host/src/resource-loader-impl.ts`, import the type:

```ts
import type { ExtensionModuleBinding } from "./extensions.js";
```

Add to `DefaultResourceLoaderOptions`:

```ts
	extensionModuleBindings?: ExtensionModuleBinding[];
```

Add a private field:

```ts
	private extensionModuleBindings: ExtensionModuleBinding[];
```

Set it in the constructor:

```ts
		this.extensionModuleBindings = options.extensionModuleBindings ?? [];
```

Pass it when loading extensions:

```ts
		const extensionsResult = await loadExtensions(extensionPaths, this.cwd, this.eventBus, {
			moduleBindings: this.extensionModuleBindings,
		});
```

- [ ] **Step 5: Export host subpaths used by coding-agent shims**

In `packages/agent-host/package.json`, add exports:

```json
		"./agent-session-services": {
			"types": "./dist/agent-session-services.d.ts",
			"import": "./dist/agent-session-services.js"
		},
		"./diagnostics": {
			"types": "./dist/diagnostics.d.ts",
			"import": "./dist/diagnostics.js"
		},
		"./footer-data-provider": {
			"types": "./dist/footer-data-provider.d.ts",
			"import": "./dist/footer-data-provider.js"
		},
		"./keybindings": {
			"types": "./dist/keybindings.d.ts",
			"import": "./dist/keybindings.js"
		},
		"./output-guard": {
			"types": "./dist/output-guard.d.ts",
			"import": "./dist/output-guard.js"
		},
		"./provider-display-names": {
			"types": "./dist/provider-display-names.d.ts",
			"import": "./dist/provider-display-names.js"
		},
		"./session-cwd": {
			"types": "./dist/session-cwd.d.ts",
			"import": "./dist/session-cwd.js"
		},
		"./slash-commands": {
			"types": "./dist/slash-commands.d.ts",
			"import": "./dist/slash-commands.js"
		},
		"./system-prompt": {
			"types": "./dist/system-prompt.d.ts",
			"import": "./dist/system-prompt.js"
		}
```

- [ ] **Step 6: Extend host export test**

In `packages/agent-host/test/exports.test.ts`, add imports for the new subpaths:

```ts
import * as agentSessionServices from "@mariozechner/pi-agent-host/agent-session-services";
import * as diagnostics from "@mariozechner/pi-agent-host/diagnostics";
import * as footerDataProvider from "@mariozechner/pi-agent-host/footer-data-provider";
import * as keybindings from "@mariozechner/pi-agent-host/keybindings";
import * as outputGuard from "@mariozechner/pi-agent-host/output-guard";
import * as providerDisplayNames from "@mariozechner/pi-agent-host/provider-display-names";
import * as sessionCwd from "@mariozechner/pi-agent-host/session-cwd";
import * as slashCommands from "@mariozechner/pi-agent-host/slash-commands";
import * as systemPrompt from "@mariozechner/pi-agent-host/system-prompt";
```

Add assertions:

```ts
	expect(agentSessionServices.createAgentSessionServices).toBeTypeOf("function");
	expect(diagnostics).toBeDefined();
	expect(footerDataProvider).toBeDefined();
	expect(keybindings.KEYBINDINGS).toBeDefined();
	expect(outputGuard.filterOutput).toBeTypeOf("function");
	expect(providerDisplayNames.getProviderDisplayName).toBeTypeOf("function");
	expect(sessionCwd.assertSessionCwdExists).toBeTypeOf("function");
	expect(slashCommands).toBeDefined();
	expect(systemPrompt.buildSystemPrompt).toBeTypeOf("function");
```

- [ ] **Step 7: Run host tests**

Run from `packages/agent-host`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/exports.test.ts test/boundary.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run root check**

Run from repo root:

```bash
npm run check
```

Expected: PASS with no errors, warnings, or infos.

- [ ] **Step 9: Commit host injection points**

```bash
git add packages/agent-host/src/agent-session-services.ts
git add packages/agent-host/src/resource-loader-impl.ts
git add packages/agent-host/src/resource-loader.ts
git add packages/agent-host/src/extensions/loader.ts
git add packages/agent-host/src/extensions/types.ts
git add packages/agent-host/src/index.ts
git add packages/agent-host/package.json
git add packages/agent-host/test/exports.test.ts
git commit -m "feat(agent-host): add product injection boundaries"
```

## Task 3: Make Coding Agent Compose Host Instead Of Owning Host

**Files:**
- Create: `packages/coding-agent/src/core/extension-module-bindings.ts`
- Modify: `packages/coding-agent/src/core/sdk.ts`
- Modify: `packages/coding-agent/src/core/resource-loader.ts`
- Modify: `packages/coding-agent/src/core/agent-session.ts`
- Modify: `packages/coding-agent/src/core/agent-session-runtime.ts`
- Modify: `packages/coding-agent/src/core/agent-session-services.ts`
- Modify: `packages/coding-agent/src/core/bash-executor.ts`
- Modify: `packages/coding-agent/src/core/diagnostics.ts`
- Modify: `packages/coding-agent/src/core/footer-data-provider.ts`
- Modify: `packages/coding-agent/src/core/keybindings.ts`
- Modify: `packages/coding-agent/src/core/output-guard.ts`
- Modify: `packages/coding-agent/src/core/provider-display-names.ts`
- Modify: `packages/coding-agent/src/core/session-cwd.ts`
- Modify: `packages/coding-agent/src/core/slash-commands.ts`
- Modify: `packages/coding-agent/src/core/system-prompt.ts`
- Modify: `packages/coding-agent/src/core/extensions/index.ts`
- Modify: `packages/coding-agent/src/core/extensions/runner.ts`
- Modify: `packages/coding-agent/src/core/extensions/types.ts`
- Modify: `packages/coding-agent/src/core/extensions/wrapper.ts`

- [ ] **Step 1: Add coding-agent extension binding adapter**

Create `packages/coding-agent/src/core/extension-module-bindings.ts`:

```ts
import { fileURLToPath } from "node:url";
import type { ExtensionModuleBinding } from "@mariozechner/pi-agent-host/extensions";
import * as bundledPiCodingAgent from "../../index.js";

export function createCodingAgentExtensionModuleBindings(): ExtensionModuleBinding[] {
	return [
		{
			specifier: "@mariozechner/pi-coding-agent",
			module: bundledPiCodingAgent,
			aliasPath: fileURLToPath(new URL("../../index.js", import.meta.url)),
		},
	];
}
```

- [ ] **Step 2: Replace resource loader with a thin coding adapter**

Replace `packages/coding-agent/src/core/resource-loader.ts` with:

```ts
import {
	DefaultResourceLoader as AgentHostDefaultResourceLoader,
	type DefaultResourceLoaderOptions,
} from "@mariozechner/pi-agent-host/resource-loader";
import { createCodingAgentExtensionModuleBindings } from "./extension-module-bindings.js";

export type {
	DefaultResourceLoaderOptions,
	ResourceCollision,
	ResourceDiagnostic,
	ResourceExtensionPaths,
	ResourceLoader,
} from "@mariozechner/pi-agent-host/resource-loader";
export { loadProjectContextFiles } from "@mariozechner/pi-agent-host/resource-loader";

export class DefaultResourceLoader extends AgentHostDefaultResourceLoader {
	constructor(options: DefaultResourceLoaderOptions) {
		super({
			...options,
			extensionModuleBindings: [
				...createCodingAgentExtensionModuleBindings(),
				...(options.extensionModuleBindings ?? []),
			],
		});
	}
}
```

- [ ] **Step 3: Refactor `createAgentSession()` to call host session services**

In `packages/coding-agent/src/core/sdk.ts`, replace local `AgentSession` construction with host service calls:

```ts
import {
	createAgentHostSessionFromServices,
	createAgentHostServices,
	type CreateAgentHostSessionResult,
} from "@mariozechner/pi-agent-host";
import type { AgentSession } from "@mariozechner/pi-agent-host/agent-session";
import { getAgentDir } from "../config.js";
import { createToolHtmlRenderer } from "./export-html/tool-renderer.js";
import { exportSessionToHtml } from "./export-html/index.js";
import { createAllToolDefinitions } from "./tools/index.js";
```

Keep the public `CreateAgentSessionOptions` and `CreateAgentSessionResult` names, but make `CreateAgentSessionResult` extend the host result:

```ts
export interface CreateAgentSessionResult extends CreateAgentHostSessionResult {
	session: AgentSession;
}
```

Inside `createAgentSession()`, create services and call host:

```ts
	const services = await createAgentHostServices({
		cwd,
		agentDir,
		authStorage,
		settingsManager,
		modelRegistry,
		resourceLoaderOptions: resourceLoader
			? undefined
			: {
					extensionModuleBindings: createCodingAgentExtensionModuleBindings(),
				},
	});

	const result = await createAgentHostSessionFromServices({
		services: resourceLoader
			? { ...services, resourceLoader }
			: services,
		sessionManager,
		sessionStartEvent: options.sessionStartEvent,
		model,
		thinkingLevel,
		scopedModels: options.scopedModels,
		tools: options.tools,
		noTools: options.noTools,
		customTools: options.customTools,
		baseToolDefinitionsOverride: createAllToolDefinitions(cwd),
		htmlExporter: (targetSessionManager, state, exportOptions) =>
			exportSessionToHtml(targetSessionManager, state, {
				...exportOptions,
				getToolDefinition: exportOptions.getToolDefinition,
				toolRenderer: createToolHtmlRenderer(exportOptions.getToolDefinition),
			}),
	});

	return result;
```

Retain coding-agent-specific model selection by resolving `model` before the host call using existing `findInitialModel()` logic. Do not move `findInitialModel()` into `agent-host`.

- [ ] **Step 4: Replace generic host core files with shims**

Replace each file with exactly the listed one-line content:

```ts
// packages/coding-agent/src/core/agent-session.ts
export * from "@mariozechner/pi-agent-host/agent-session";
```

```ts
// packages/coding-agent/src/core/agent-session-runtime.ts
export * from "@mariozechner/pi-agent-host/agent-session-runtime";
```

```ts
// packages/coding-agent/src/core/agent-session-services.ts
export * from "@mariozechner/pi-agent-host/agent-session-services";
```

```ts
// packages/coding-agent/src/core/bash-executor.ts
export * from "@mariozechner/pi-agent-host/bash-executor";
```

```ts
// packages/coding-agent/src/core/diagnostics.ts
export * from "@mariozechner/pi-agent-host/diagnostics";
```

```ts
// packages/coding-agent/src/core/footer-data-provider.ts
export * from "@mariozechner/pi-agent-host/footer-data-provider";
```

```ts
// packages/coding-agent/src/core/keybindings.ts
export * from "@mariozechner/pi-agent-host/keybindings";
```

```ts
// packages/coding-agent/src/core/output-guard.ts
export * from "@mariozechner/pi-agent-host/output-guard";
```

```ts
// packages/coding-agent/src/core/provider-display-names.ts
export * from "@mariozechner/pi-agent-host/provider-display-names";
```

```ts
// packages/coding-agent/src/core/session-cwd.ts
export * from "@mariozechner/pi-agent-host/session-cwd";
```

```ts
// packages/coding-agent/src/core/slash-commands.ts
export * from "@mariozechner/pi-agent-host/slash-commands";
```

```ts
// packages/coding-agent/src/core/system-prompt.ts
export * from "@mariozechner/pi-agent-host/system-prompt";
```

```ts
// packages/coding-agent/src/core/extensions/index.ts
export * from "@mariozechner/pi-agent-host/extensions";
```

```ts
// packages/coding-agent/src/core/extensions/runner.ts
export * from "@mariozechner/pi-agent-host/extensions";
```

```ts
// packages/coding-agent/src/core/extensions/types.ts
export * from "@mariozechner/pi-agent-host/extensions";
```

```ts
// packages/coding-agent/src/core/extensions/wrapper.ts
export * from "@mariozechner/pi-agent-host/extensions";
```

- [ ] **Step 5: Keep approved coding-owned files unchanged**

Do not move these files in this task:

```text
packages/coding-agent/src/core/model-resolver.ts
packages/coding-agent/src/core/telemetry.ts
packages/coding-agent/src/core/timings.ts
packages/coding-agent/src/core/tools/*
packages/coding-agent/src/core/export-html/*
packages/coding-agent/src/core/orchestration/coding-worker.ts
packages/coding-agent/src/modes/*
packages/coding-agent/src/cli/*
```

- [ ] **Step 6: Run coding-agent shim test**

Run from `packages/coding-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/architecture/core-host-shims.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run coding worker test**

Run from `packages/coding-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/orchestration/coding-worker.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run root check**

Run from repo root:

```bash
npm run check
```

Expected: PASS with no errors, warnings, or infos.

- [ ] **Step 9: Commit coding-agent host composition**

```bash
git add packages/coding-agent/src/core/extension-module-bindings.ts
git add packages/coding-agent/src/core/sdk.ts
git add packages/coding-agent/src/core/resource-loader.ts
git add packages/coding-agent/src/core/agent-session.ts
git add packages/coding-agent/src/core/agent-session-runtime.ts
git add packages/coding-agent/src/core/agent-session-services.ts
git add packages/coding-agent/src/core/bash-executor.ts
git add packages/coding-agent/src/core/diagnostics.ts
git add packages/coding-agent/src/core/footer-data-provider.ts
git add packages/coding-agent/src/core/keybindings.ts
git add packages/coding-agent/src/core/output-guard.ts
git add packages/coding-agent/src/core/provider-display-names.ts
git add packages/coding-agent/src/core/session-cwd.ts
git add packages/coding-agent/src/core/slash-commands.ts
git add packages/coding-agent/src/core/system-prompt.ts
git add packages/coding-agent/src/core/extensions/index.ts
git add packages/coding-agent/src/core/extensions/runner.ts
git add packages/coding-agent/src/core/extensions/types.ts
git add packages/coding-agent/src/core/extensions/wrapper.ts
git add packages/coding-agent/test/suite/architecture/core-host-shims.test.ts
git commit -m "refactor(coding-agent): compose host runtime"
```

## Task 4: Add Narrow Coding Worker Public API

**Files:**
- Create: `packages/coding-agent/src/worker.ts`
- Modify: `packages/coding-agent/package.json`
- Modify: `packages/coding-agent/src/index.ts`
- Test: `packages/coding-agent/test/suite/orchestration/coding-worker.test.ts`

- [ ] **Step 1: Create worker-only entrypoint**

Create `packages/coding-agent/src/worker.ts`:

```ts
export {
	buildCodingWorkerPrompt,
	type RunCodingWorkerOptions,
	runCodingWorker,
} from "./core/orchestration/coding-worker.js";
```

- [ ] **Step 2: Add package export**

In `packages/coding-agent/package.json`, add:

```json
		"./worker": {
			"types": "./dist/worker.d.ts",
			"import": "./dist/worker.js"
		}
```

- [ ] **Step 3: Keep root export for interactive SDK users**

In `packages/coding-agent/src/index.ts`, keep the existing worker export:

```ts
export {
	buildCodingWorkerPrompt,
	type RunCodingWorkerOptions,
	runCodingWorker,
} from "./core/orchestration/coding-worker.js";
```

This preserves existing imports while giving `lead-agent` a narrower dependency target.

- [ ] **Step 4: Extend worker test with subpath import**

In `packages/coding-agent/test/suite/orchestration/coding-worker.test.ts`, add:

```ts
import { runCodingWorker as runCodingWorkerFromSubpath } from "../../../src/worker.js";

it("exposes the worker adapter through the worker entrypoint", () => {
	expect(runCodingWorkerFromSubpath).toBe(runCodingWorker);
});
```

- [ ] **Step 5: Run worker test**

Run from `packages/coding-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/orchestration/coding-worker.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run root check**

Run from repo root:

```bash
npm run check
```

Expected: PASS with no errors, warnings, or infos.

- [ ] **Step 7: Commit worker entrypoint**

```bash
git add packages/coding-agent/src/worker.ts
git add packages/coding-agent/package.json
git add packages/coding-agent/src/index.ts
git add packages/coding-agent/test/suite/orchestration/coding-worker.test.ts
git commit -m "feat(coding-agent): expose worker entrypoint"
```

## Task 5: Move Lead Agent To A Worker Gateway

**Files:**
- Create: `packages/lead-agent/src/workers/coding-worker-dispatcher.ts`
- Modify: `packages/lead-agent/src/index.ts`
- Modify: `packages/lead-agent/test/lead-agent.test.ts`
- Modify: `packages/lead-agent/test/boundary.test.ts`

- [ ] **Step 1: Add lead-side coding worker gateway**

Create `packages/lead-agent/src/workers/coding-worker-dispatcher.ts`:

```ts
import type { WorkerRequest, WorkerResult } from "@mariozechner/pi-agent-contracts";
import { runCodingWorker } from "@mariozechner/pi-coding-agent/worker";

export type CodingWorkerDispatcher = (request: WorkerRequest) => Promise<WorkerResult>;

export const dispatchCodingWorker: CodingWorkerDispatcher = (request) => runCodingWorker(request);
```

- [ ] **Step 2: Replace direct coding-agent import in lead runtime**

In `packages/lead-agent/src/index.ts`, replace:

```ts
import { runCodingWorker } from "@mariozechner/pi-coding-agent";
```

with:

```ts
import { dispatchCodingWorker } from "./workers/coding-worker-dispatcher.js";
```

Replace:

```ts
	const workerRunner = options.workerRunner ?? runCodingWorker;
```

with:

```ts
	const workerRunner = options.workerRunner ?? dispatchCodingWorker;
```

- [ ] **Step 3: Keep tests using injected worker runners**

In `packages/lead-agent/test/lead-agent.test.ts`, ensure tests construct `createLeadAgentRuntime({ workerRunner })` for deterministic cases:

```ts
const workerRunner = async (request: WorkerRequest): Promise<WorkerResult> => ({
	id: `${request.id}-result`,
	requestId: request.id,
	status: "success",
	summary: "Generated evidence summary with claim audit.",
	structuredOutputs: {
		"evidence summary": "Evidence summary content",
		"claim audit": "Claim audit content",
	},
	artifacts: [],
	warnings: [],
	openQuestions: [],
	trace: createExecutionTrace({
		workerId: "test-worker",
		events: [],
	}),
});
```

- [ ] **Step 4: Run lead boundary test**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/boundary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run lead runtime tests**

Run from `packages/lead-agent`:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lead-agent.test.ts test/boundary.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run academic smoke test**

Run from repo root:

```bash
rm -rf .tmp/academic-smoke && ./academic-smoke-test.sh --artifact-dir .tmp/academic-smoke --json
```

Expected: command exits 0 and JSON contains `"passed": true`.

- [ ] **Step 7: Run root check**

Run from repo root:

```bash
npm run check
```

Expected: PASS with no errors, warnings, or infos.

- [ ] **Step 8: Commit lead worker gateway**

```bash
git add packages/lead-agent/src/workers/coding-worker-dispatcher.ts
git add packages/lead-agent/src/index.ts
git add packages/lead-agent/test/lead-agent.test.ts
git add packages/lead-agent/test/boundary.test.ts
git commit -m "refactor(lead-agent): dispatch coding work through gateway"
```

## Task 6: Tighten Documentation And Changelogs

**Files:**
- Modify: `docs/superpowers/plan/2026-05-08-plan-lead-agent.md`
- Modify: `packages/agent-host/README.md`
- Modify: `packages/coding-agent/README.md`
- Modify: `packages/lead-agent/README.md`
- Modify: `packages/agent-host/CHANGELOG.md`
- Modify: `packages/coding-agent/CHANGELOG.md`
- Modify: `packages/lead-agent/CHANGELOG.md`

- [ ] **Step 1: Update architecture plan status**

In `docs/superpowers/plan/2026-05-08-plan-lead-agent.md`, add a section after `Summary`:

```md
## Boundary Status

- `agent-host` owns generic runtime/session/resource/extension infrastructure.
- `coding-agent` composes `agent-host` with coding tools, CLI/TUI/RPC modes, and the worker adapter.
- `lead-agent` composes `agent-host` with academic planning, acceptance, synthesis, and dispatches coding work through `@mariozechner/pi-coding-agent/worker`.
- `agent-host` must not parse academic task semantics or import product packages.
```

- [ ] **Step 2: Update host README boundary**

In `packages/agent-host/README.md`, add:

```md
## Package Boundary

`agent-host` is the reusable runtime layer. It owns session/runtime creation, settings, auth/model registry wiring, resource loading, extension runtime, prompt/template/skill loading, and session persistence.

It does not own product semantics. Academic task planning belongs in `lead-agent`; coding tools and coding CLI/TUI/RPC behavior belong in `coding-agent`.
```

- [ ] **Step 3: Update coding-agent README boundary**

In `packages/coding-agent/README.md`, add:

```md
## Package Boundary

`coding-agent` is the coding product shell. It composes `agent-host` with coding tools, coding defaults, CLI/TUI/RPC modes, and the orchestration-safe worker adapter.

Use `@mariozechner/pi-coding-agent/worker` when another package needs coding-agent as a worker. Do not import the package root from orchestrators such as `lead-agent`.
```

- [ ] **Step 4: Update lead-agent README boundary**

In `packages/lead-agent/README.md`, add:

```md
## Package Boundary

`lead-agent` owns academic task understanding, planning, profile selection, worker dispatch, acceptance, and final synthesis. It uses `agent-host` for runtime/session infrastructure and dispatches coding work through a narrow worker gateway.

`agent-host` does not parse academic tasks. `coding-agent` does not make final academic authoring decisions.
```

- [ ] **Step 5: Add changelog entries**

Add under each package's `## [Unreleased]` section.

`packages/agent-host/CHANGELOG.md`:

```md
### Changed

- Added product injection boundaries for tools, HTML export, and extension module bindings.
```

`packages/coding-agent/CHANGELOG.md`:

```md
### Changed

- Moved generic host runtime ownership to `agent-host` and retained coding-agent compatibility exports as host-backed shims.

### Added

- Added a narrow `@mariozechner/pi-coding-agent/worker` entrypoint for orchestration use.
```

`packages/lead-agent/CHANGELOG.md`:

```md
### Changed

- Routed coding work through a lead-agent worker gateway instead of importing the coding-agent package root.
```

- [ ] **Step 6: Run root check**

Run from repo root:

```bash
npm run check
```

Expected: PASS with no errors, warnings, or infos.

- [ ] **Step 7: Commit docs and changelogs**

```bash
git add docs/superpowers/plan/2026-05-08-plan-lead-agent.md
git add packages/agent-host/README.md
git add packages/coding-agent/README.md
git add packages/lead-agent/README.md
git add packages/agent-host/CHANGELOG.md
git add packages/coding-agent/CHANGELOG.md
git add packages/lead-agent/CHANGELOG.md
git commit -m "docs: clarify agent package boundaries"
```

## Task 7: Final Verification Sweep

**Files:**
- No source files should be modified in this task unless a verification failure identifies a concrete bug.

- [ ] **Step 1: Verify no product imports exist in `agent-host`**

Run from repo root:

```bash
rg -n "@mariozechner/pi-coding-agent|@mariozechner/pi-lead-agent|packages/coding-agent|packages/lead-agent" packages/agent-host/src packages/agent-host/test
```

Expected: no output except test files that intentionally list forbidden strings in assertions.

- [ ] **Step 2: Verify lead-agent uses only the worker gateway for coding work**

Run from repo root:

```bash
rg -n "@mariozechner/pi-coding-agent" packages/lead-agent/src packages/lead-agent/test
```

Expected output:

```text
packages/lead-agent/src/workers/coding-worker-dispatcher.ts:2:import { runCodingWorker } from "@mariozechner/pi-coding-agent/worker";
```

- [ ] **Step 3: Verify migrated coding-agent host files are shims or approved adapters**

Run from repo root:

```bash
find packages/coding-agent/src/core -maxdepth 2 -type f -name "*.ts" | sort
```

Expected: host-owned files are one-line shims, while these files remain implementation files:

```text
packages/coding-agent/src/core/sdk.ts
packages/coding-agent/src/core/model-resolver.ts
packages/coding-agent/src/core/telemetry.ts
packages/coding-agent/src/core/timings.ts
packages/coding-agent/src/core/tools/*
packages/coding-agent/src/core/export-html/*
packages/coding-agent/src/core/orchestration/coding-worker.ts
packages/coding-agent/src/core/resource-loader.ts
packages/coding-agent/src/core/extension-module-bindings.ts
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
(cd packages/agent-host && npx tsx ../../node_modules/vitest/dist/cli.js --run test/boundary.test.ts test/exports.test.ts test/agent-session.test.ts)
(cd packages/coding-agent && npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/architecture/core-host-shims.test.ts test/suite/orchestration/coding-worker.test.ts)
(cd packages/lead-agent && npx tsx ../../node_modules/vitest/dist/cli.js --run test/boundary.test.ts test/lead-agent.test.ts test/academic-smoke.test.ts)
```

Expected: all listed tests PASS.

- [ ] **Step 5: Run academic smoke**

Run from repo root:

```bash
rm -rf .tmp/academic-smoke && ./academic-smoke-test.sh --artifact-dir .tmp/academic-smoke --json
```

Expected: command exits 0 and JSON contains `"passed": true`.

- [ ] **Step 6: Run root check**

Run from repo root:

```bash
npm run check
```

Expected: PASS with no errors, warnings, or infos.

- [ ] **Step 7: Commit any verification fixes**

If no files changed, do not commit. If verification required fixes, stage only the fixed files:

```bash
git add path/to/fixed-file.ts
git commit -m "fix: complete agent boundary verification"
```

## Self-Review

Spec coverage:
- Full host ownership is covered by Tasks 1, 2, 3, and 7.
- Coding-agent worker ownership is covered by Tasks 3 and 4.
- Lead-agent orchestration ownership is covered by Task 5.
- Documentation and changelog clarity are covered by Task 6.
- Verification commands cover focused tests, smoke workflow, and root `npm run check`.

Placeholder scan:
- This plan avoids deferred placeholders and gives exact files, commands, expected results, and code snippets for the migration boundaries.

Type consistency:
- `ExtensionModuleBinding` is defined in `agent-host/src/extensions/types.ts` and consumed through `@mariozechner/pi-agent-host/extensions`.
- `dispatchCodingWorker` implements `(request: WorkerRequest) => Promise<WorkerResult>`, matching `LeadAgentWorkerRunner`.
- `CreateAgentSessionFromServicesOptions` owns product injection fields used by `coding-agent/src/core/sdk.ts`.
