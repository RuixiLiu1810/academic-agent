import type { WorkerRequest, WorkerResult } from "@mariozechner/pi-agent-contracts";
import { runCodingWorker } from "@mariozechner/pi-coding-agent/worker";
import type { LeadAgentWorkerRunner } from "../orchestration/types.js";

export const dispatchCodingWorker: LeadAgentWorkerRunner = (request: WorkerRequest): Promise<WorkerResult> =>
	runCodingWorker(request);
