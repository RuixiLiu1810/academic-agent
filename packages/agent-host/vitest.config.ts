import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const aiSrcIndex = fileURLToPath(new URL("../ai/src/index.ts", import.meta.url));
const agentSrcIndex = fileURLToPath(new URL("../agent/src/index.ts", import.meta.url));
const codingAgentSrcIndex = fileURLToPath(new URL("../coding-agent/src/index.ts", import.meta.url));
const codingAgentPackageManager = fileURLToPath(new URL("../coding-agent/src/core/package-manager.ts", import.meta.url));
const codingAgentSourceInfo = fileURLToPath(new URL("../coding-agent/src/core/source-info.ts", import.meta.url));
const codingAgentSkills = fileURLToPath(new URL("../coding-agent/src/core/skills.ts", import.meta.url));
const codingAgentPromptTemplates = fileURLToPath(
	new URL("../coding-agent/src/core/prompt-templates.ts", import.meta.url),
);
const codingAgentResourceLoader = fileURLToPath(
	new URL("../coding-agent/src/core/resource-loader.ts", import.meta.url),
);
const codingAgentExtensions = fileURLToPath(new URL("../coding-agent/src/core/extensions/index.ts", import.meta.url));
const codingAgentAgentSession = fileURLToPath(new URL("../coding-agent/src/core/agent-session.ts", import.meta.url));
const codingAgentAgentSessionRuntime = fileURLToPath(
	new URL("../coding-agent/src/core/agent-session-runtime.ts", import.meta.url),
);
const agentContractsSrcIndex = fileURLToPath(new URL("../agent-contracts/src/index.ts", import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
	},
	resolve: {
		alias: [
			{ find: /^@mariozechner\/pi-ai$/, replacement: aiSrcIndex },
			{ find: /^@mariozechner\/pi-agent-core$/, replacement: agentSrcIndex },
			{ find: /^@mariozechner\/pi-agent-contracts$/, replacement: agentContractsSrcIndex },
			{ find: /^@mariozechner\/pi-coding-agent\/package-manager$/, replacement: codingAgentPackageManager },
			{ find: /^@mariozechner\/pi-coding-agent\/source-info$/, replacement: codingAgentSourceInfo },
			{ find: /^@mariozechner\/pi-coding-agent\/skills$/, replacement: codingAgentSkills },
			{ find: /^@mariozechner\/pi-coding-agent\/prompt-templates$/, replacement: codingAgentPromptTemplates },
			{ find: /^@mariozechner\/pi-coding-agent\/resource-loader$/, replacement: codingAgentResourceLoader },
			{ find: /^@mariozechner\/pi-coding-agent\/extensions$/, replacement: codingAgentExtensions },
			{ find: /^@mariozechner\/pi-coding-agent\/agent-session$/, replacement: codingAgentAgentSession },
			{ find: /^@mariozechner\/pi-coding-agent\/agent-session-runtime$/, replacement: codingAgentAgentSessionRuntime },
			{ find: /^@mariozechner\/pi-coding-agent$/, replacement: codingAgentSrcIndex },
		],
	},
});
