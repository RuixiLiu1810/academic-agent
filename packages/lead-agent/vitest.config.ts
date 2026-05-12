import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const aiSrcIndex = fileURLToPath(new URL("../ai/src/index.ts", import.meta.url));
const aiSrcOAuth = fileURLToPath(new URL("../ai/src/oauth.ts", import.meta.url));
const agentSrcIndex = fileURLToPath(new URL("../agent/src/index.ts", import.meta.url));
const agentContractsSrcIndex = fileURLToPath(new URL("../agent-contracts/src/index.ts", import.meta.url));
const agentHostSrcIndex = fileURLToPath(new URL("../agent-host/src/index.ts", import.meta.url));
const artifactCoreSrcIndex = fileURLToPath(new URL("../artifact-core/src/index.ts", import.meta.url));
const agentHostAgentSession = fileURLToPath(new URL("../agent-host/src/agent-session.ts", import.meta.url));
const agentHostAgentSessionRuntime = fileURLToPath(new URL("../agent-host/src/agent-session-runtime.ts", import.meta.url));
const agentHostAgentSessionServices = fileURLToPath(new URL("../agent-host/src/agent-session-services.ts", import.meta.url));
const agentHostAuthStorage = fileURLToPath(new URL("../agent-host/src/auth-storage.ts", import.meta.url));
const agentHostBashExecutor = fileURLToPath(new URL("../agent-host/src/bash-executor.ts", import.meta.url));
const agentHostCompaction = fileURLToPath(new URL("../agent-host/src/compaction/index.ts", import.meta.url));
const agentHostDiagnostics = fileURLToPath(new URL("../agent-host/src/diagnostics.ts", import.meta.url));
const agentHostEventBus = fileURLToPath(new URL("../agent-host/src/event-bus.ts", import.meta.url));
const agentHostExec = fileURLToPath(new URL("../agent-host/src/exec.ts", import.meta.url));
const agentHostExtensions = fileURLToPath(new URL("../agent-host/src/extensions.ts", import.meta.url));
const agentHostFooterDataProvider = fileURLToPath(new URL("../agent-host/src/footer-data-provider.ts", import.meta.url));
const agentHostKeybindings = fileURLToPath(new URL("../agent-host/src/keybindings.ts", import.meta.url));
const agentHostMessages = fileURLToPath(new URL("../agent-host/src/messages.ts", import.meta.url));
const agentHostModelRegistry = fileURLToPath(new URL("../agent-host/src/model-registry.ts", import.meta.url));
const agentHostOutputGuard = fileURLToPath(new URL("../agent-host/src/output-guard.ts", import.meta.url));
const agentHostPackageManager = fileURLToPath(new URL("../agent-host/src/package-manager.ts", import.meta.url));
const agentHostPromptTemplates = fileURLToPath(new URL("../agent-host/src/prompt-templates.ts", import.meta.url));
const agentHostProviderDisplayNames = fileURLToPath(new URL("../agent-host/src/provider-display-names.ts", import.meta.url));
const agentHostResolveConfigValue = fileURLToPath(
	new URL("../agent-host/src/resolve-config-value.ts", import.meta.url),
);
const agentHostResourceLoader = fileURLToPath(new URL("../agent-host/src/resource-loader.ts", import.meta.url));
const agentHostSessionCwd = fileURLToPath(new URL("../agent-host/src/session-cwd.ts", import.meta.url));
const agentHostSessionManager = fileURLToPath(new URL("../agent-host/src/session-manager.ts", import.meta.url));
const agentHostSettingsManager = fileURLToPath(new URL("../agent-host/src/settings-manager.ts", import.meta.url));
const agentHostSkills = fileURLToPath(new URL("../agent-host/src/skills.ts", import.meta.url));
const agentHostSlashCommands = fileURLToPath(new URL("../agent-host/src/slash-commands.ts", import.meta.url));
const agentHostSourceInfo = fileURLToPath(new URL("../agent-host/src/source-info.ts", import.meta.url));
const agentHostSystemPrompt = fileURLToPath(new URL("../agent-host/src/system-prompt.ts", import.meta.url));
const agentHostThemeLoader = fileURLToPath(new URL("../agent-host/src/theme-loader.ts", import.meta.url));
const codingAgentSrcIndex = fileURLToPath(new URL("../coding-agent/src/index.ts", import.meta.url));
const codingAgentWorker = fileURLToPath(new URL("../coding-agent/src/worker.ts", import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
	},
	resolve: {
		alias: [
			{ find: /^@mariozechner\/pi-ai$/, replacement: aiSrcIndex },
			{ find: /^@mariozechner\/pi-ai\/oauth$/, replacement: aiSrcOAuth },
			{ find: /^@mariozechner\/pi-agent-core$/, replacement: agentSrcIndex },
			{ find: /^@mariozechner\/pi-agent-contracts$/, replacement: agentContractsSrcIndex },
			{ find: /^@mariozechner\/pi-agent-host$/, replacement: agentHostSrcIndex },
			{ find: /^@mariozechner\/pi-artifact-core$/, replacement: artifactCoreSrcIndex },
			{ find: /^@mariozechner\/pi-agent-host\/agent-session$/, replacement: agentHostAgentSession },
			{ find: /^@mariozechner\/pi-agent-host\/agent-session-runtime$/, replacement: agentHostAgentSessionRuntime },
			{ find: /^@mariozechner\/pi-agent-host\/agent-session-services$/, replacement: agentHostAgentSessionServices },
			{ find: /^@mariozechner\/pi-agent-host\/auth-storage$/, replacement: agentHostAuthStorage },
			{ find: /^@mariozechner\/pi-agent-host\/bash-executor$/, replacement: agentHostBashExecutor },
			{ find: /^@mariozechner\/pi-agent-host\/compaction$/, replacement: agentHostCompaction },
			{ find: /^@mariozechner\/pi-agent-host\/diagnostics$/, replacement: agentHostDiagnostics },
			{ find: /^@mariozechner\/pi-agent-host\/event-bus$/, replacement: agentHostEventBus },
			{ find: /^@mariozechner\/pi-agent-host\/exec$/, replacement: agentHostExec },
			{ find: /^@mariozechner\/pi-agent-host\/extensions$/, replacement: agentHostExtensions },
			{ find: /^@mariozechner\/pi-agent-host\/footer-data-provider$/, replacement: agentHostFooterDataProvider },
			{ find: /^@mariozechner\/pi-agent-host\/keybindings$/, replacement: agentHostKeybindings },
			{ find: /^@mariozechner\/pi-agent-host\/messages$/, replacement: agentHostMessages },
			{ find: /^@mariozechner\/pi-agent-host\/model-registry$/, replacement: agentHostModelRegistry },
			{ find: /^@mariozechner\/pi-agent-host\/output-guard$/, replacement: agentHostOutputGuard },
			{ find: /^@mariozechner\/pi-agent-host\/package-manager$/, replacement: agentHostPackageManager },
			{ find: /^@mariozechner\/pi-agent-host\/prompt-templates$/, replacement: agentHostPromptTemplates },
			{ find: /^@mariozechner\/pi-agent-host\/provider-display-names$/, replacement: agentHostProviderDisplayNames },
			{ find: /^@mariozechner\/pi-agent-host\/resolve-config-value$/, replacement: agentHostResolveConfigValue },
			{ find: /^@mariozechner\/pi-agent-host\/resource-loader$/, replacement: agentHostResourceLoader },
			{ find: /^@mariozechner\/pi-agent-host\/session-cwd$/, replacement: agentHostSessionCwd },
			{ find: /^@mariozechner\/pi-agent-host\/session-manager$/, replacement: agentHostSessionManager },
			{ find: /^@mariozechner\/pi-agent-host\/settings-manager$/, replacement: agentHostSettingsManager },
			{ find: /^@mariozechner\/pi-agent-host\/skills$/, replacement: agentHostSkills },
			{ find: /^@mariozechner\/pi-agent-host\/slash-commands$/, replacement: agentHostSlashCommands },
			{ find: /^@mariozechner\/pi-agent-host\/source-info$/, replacement: agentHostSourceInfo },
			{ find: /^@mariozechner\/pi-agent-host\/system-prompt$/, replacement: agentHostSystemPrompt },
			{ find: /^@mariozechner\/pi-agent-host\/theme-loader$/, replacement: agentHostThemeLoader },
			{ find: /^@mariozechner\/pi-coding-agent$/, replacement: codingAgentSrcIndex },
			{ find: /^@mariozechner\/pi-coding-agent\/worker$/, replacement: codingAgentWorker },
		],
	},
});
