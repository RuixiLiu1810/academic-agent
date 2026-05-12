import type { WorkerRequest, WorkerResult } from "@mariozechner/pi-agent-contracts";
import { runCodingWorker } from "@mariozechner/pi-coding-agent/worker";

export type CodingWorkerDispatcher = (request: WorkerRequest) => Promise<WorkerResult>;

export const dispatchCodingWorker: CodingWorkerDispatcher = (request) => runCodingWorker(request);
