import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const agentContractsSrcIndex = fileURLToPath(new URL("../agent-contracts/src/index.ts", import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
	},
	resolve: {
		alias: [{ find: /^@mariozechner\/pi-agent-contracts$/, replacement: agentContractsSrcIndex }],
	},
});
