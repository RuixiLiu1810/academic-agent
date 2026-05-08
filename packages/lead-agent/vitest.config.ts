import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const agentContractsSrcIndex = fileURLToPath(new URL("../agent-contracts/src/index.ts", import.meta.url));
const agentHostSrcIndex = fileURLToPath(new URL("../agent-host/src/index.ts", import.meta.url));
const codingAgentSrcIndex = fileURLToPath(new URL("../coding-agent/src/index.ts", import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
	},
	resolve: {
		alias: [
			{ find: /^@mariozechner\/pi-agent-contracts$/, replacement: agentContractsSrcIndex },
			{ find: /^@mariozechner\/pi-agent-host$/, replacement: agentHostSrcIndex },
			{ find: /^@mariozechner\/pi-coding-agent$/, replacement: codingAgentSrcIndex },
		],
	},
});
