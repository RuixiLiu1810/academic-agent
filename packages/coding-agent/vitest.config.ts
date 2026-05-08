import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const aiSrcIndex = fileURLToPath(new URL("../ai/src/index.ts", import.meta.url));
const aiSrcOAuth = fileURLToPath(new URL("../ai/src/oauth.ts", import.meta.url));
const agentSrcIndex = fileURLToPath(new URL("../agent/src/index.ts", import.meta.url));
const agentContractsSrcIndex = fileURLToPath(new URL("../agent-contracts/src/index.ts", import.meta.url));
const agentHostSrcIndex = fileURLToPath(new URL("../agent-host/src/index.ts", import.meta.url));
const agentHostAuthStorage = fileURLToPath(new URL("../agent-host/src/auth-storage.ts", import.meta.url));
const agentHostCompaction = fileURLToPath(new URL("../agent-host/src/compaction/index.ts", import.meta.url));
const agentHostEventBus = fileURLToPath(new URL("../agent-host/src/event-bus.ts", import.meta.url));
const agentHostExec = fileURLToPath(new URL("../agent-host/src/exec.ts", import.meta.url));
const agentHostMessages = fileURLToPath(new URL("../agent-host/src/messages.ts", import.meta.url));
const agentHostModelRegistry = fileURLToPath(new URL("../agent-host/src/model-registry.ts", import.meta.url));
const agentHostPackageManager = fileURLToPath(new URL("../agent-host/src/package-manager.ts", import.meta.url));
const agentHostPromptTemplates = fileURLToPath(new URL("../agent-host/src/prompt-templates.ts", import.meta.url));
const agentHostResolveConfigValue = fileURLToPath(
	new URL("../agent-host/src/resolve-config-value.ts", import.meta.url),
);
const agentHostSessionManager = fileURLToPath(new URL("../agent-host/src/session-manager.ts", import.meta.url));
const agentHostSettingsManager = fileURLToPath(new URL("../agent-host/src/settings-manager.ts", import.meta.url));
const agentHostSkills = fileURLToPath(new URL("../agent-host/src/skills.ts", import.meta.url));
const agentHostSourceInfo = fileURLToPath(new URL("../agent-host/src/source-info.ts", import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		testTimeout: 30000,
		server: {
			deps: {
				external: [/@silvia-odwyer\/photon-node/],
			},
		},
	},
	resolve: {
		alias: [
			{ find: /^@mariozechner\/pi-ai$/, replacement: aiSrcIndex },
			{ find: /^@mariozechner\/pi-ai\/oauth$/, replacement: aiSrcOAuth },
			{ find: /^@mariozechner\/pi-agent-core$/, replacement: agentSrcIndex },
			{ find: /^@mariozechner\/pi-agent-contracts$/, replacement: agentContractsSrcIndex },
			{ find: /^@mariozechner\/pi-agent-host$/, replacement: agentHostSrcIndex },
			{ find: /^@mariozechner\/pi-agent-host\/auth-storage$/, replacement: agentHostAuthStorage },
			{ find: /^@mariozechner\/pi-agent-host\/compaction$/, replacement: agentHostCompaction },
			{ find: /^@mariozechner\/pi-agent-host\/event-bus$/, replacement: agentHostEventBus },
			{ find: /^@mariozechner\/pi-agent-host\/exec$/, replacement: agentHostExec },
			{ find: /^@mariozechner\/pi-agent-host\/messages$/, replacement: agentHostMessages },
			{ find: /^@mariozechner\/pi-agent-host\/model-registry$/, replacement: agentHostModelRegistry },
			{ find: /^@mariozechner\/pi-agent-host\/package-manager$/, replacement: agentHostPackageManager },
			{ find: /^@mariozechner\/pi-agent-host\/prompt-templates$/, replacement: agentHostPromptTemplates },
			{ find: /^@mariozechner\/pi-agent-host\/resolve-config-value$/, replacement: agentHostResolveConfigValue },
			{ find: /^@mariozechner\/pi-agent-host\/session-manager$/, replacement: agentHostSessionManager },
			{ find: /^@mariozechner\/pi-agent-host\/settings-manager$/, replacement: agentHostSettingsManager },
			{ find: /^@mariozechner\/pi-agent-host\/skills$/, replacement: agentHostSkills },
			{ find: /^@mariozechner\/pi-agent-host\/source-info$/, replacement: agentHostSourceInfo },
		],
	},
});
