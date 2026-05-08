# lead-agent / agent-host 迁移计划

## Summary

目标是把当前 `coding-agent` 中非 coding 专属的外壳能力抽成 `packages/agent-host`，再让 `coding-agent` 和新 `packages/lead-agent` 成为同级应用外壳。`lead-agent` 负责学术研究/写作总控；`coding-agent` 保留现有 CLI/TUI/RPC/SDK 行为，并额外暴露 worker 化执行接口。

默认策略：**先抽 agent-host，保持 coding-agent 行为兼容，不提交 commit，除非用户另行要求。**

## Key Changes

### Phase 0: 修正架构 spec

- 将现有 spec 改成三段式：`Current State`、`Target Architecture`、`Migration Plan`。
- 明确当前不存在 `lead-agent`、`agent-contracts`、`artifact-core`，这些是 proposed packages。
- 明确 `coding-agent` 当前是完整 host，不是纯 worker；迁移目标是把 host 能力下沉到 `agent-host`。
- 明确 subagent workflow 是可选执行机制，`lead-agent` 始终是 lead-author / orchestrator。

### Phase 1: 新建 `packages/agent-host`

抽出通用 host 能力，先不引入学术逻辑：

- Session/runtime：`AgentSession`、`AgentSessionRuntime`、`SessionManager`、session tree/fork/compact/export。
- Host services：settings、auth/model registry wiring、resource loading、extension runtime、prompt/template/skill loading。
- Modes 基础接口：print/rpc/interactive 的通用 host contracts；TUI 具体组件仍留在 `coding-agent`。
- Public API：
  - `createAgentHostSession()`
  - `createAgentHostRuntime()`
  - `AgentHostSession`
  - `AgentHostRuntime`
  - `SessionManager`
  - `ResourceLoader`
  - extension/session/message types

`coding-agent` 在这一阶段改为从 `agent-host` 引用并 re-export 旧 API，确保现有 SDK import 不断。

### Phase 2: 收窄 `coding-agent`

把 `coding-agent` 定义为 coding-specific app：

- 保留 coding tools：read/bash/edit/write/find/grep/ls。
- 保留 coding prompt、coding 默认工具选择、CLI/TUI 默认交互。
- 保留现有 `pi` binary、RPC 协议、SDK 示例和测试语义。
- 删除或迁出 coding-agent 中已经进入 `agent-host` 的通用实现，只保留兼容 re-export。
- 验证旧入口仍可用：CLI、print mode、RPC mode、SDK session、TUI smoke 相关测试。

### Phase 3: 新建 `packages/agent-contracts`

先定义最小稳定协议，不一次性塞满所有学术对象：

- `WorkerRequest`
- `WorkerResult`
- `WorkerProfile`
- `ArtifactRef`
- `ArtifactManifest`
- `ExecutionTrace`
- `AcceptanceReport`

约束：

- contracts 不依赖 host 包。
- `WorkerRequest` 表达 objective、constraints、input artifacts、expected outputs、budget、profile。
- `WorkerResult` 表达 status、summary、structured outputs、artifact refs、warnings、open questions、trace。
- 学术专用类型如 `EvidenceTable`、`RevisionPlan` 后续扩展，不阻塞第一闭环。

### Phase 4: 给 `coding-agent` 增加 worker adapter

在 `packages/coding-agent` 新增 orchestration-safe worker 路径：

- 接收 `WorkerRequest`。
- 创建隔离 worker session，默认使用 in-memory 或显式 worker session dir。
- 将 objective/constraints/profile 转为一次具体执行 prompt。
- 执行后返回 `WorkerResult`。
- 附带 session id、message summary、tool trace、产生的 artifact refs。
- 不改变 standalone coding-agent 模式。

Public API：

- `runCodingWorker(request, options): Promise<WorkerResult>`
- RPC 可后续新增 `worker_run` 命令，但第一版优先 SDK adapter，避免扩大 wire protocol 风险。

### Phase 5: 新建 `packages/lead-agent`

实现最小 academic lead 闭环：

- 基于 `agent-host` 建主 session，不依赖 `coding-agent` 才能获得 session/runtime/mode 能力。
- 内部模块最小化：
  - intake：解析用户学术任务和约束。
  - planner：判断单 agent 处理还是派发 worker。
  - dispatcher：调用 coding-agent worker adapter。
  - acceptance：检查 worker result 是否满足 expected outputs。
  - synthesis：生成用户可见最终稿。
- 第一版只支持 1 个 worker dispatch + lead synthesis；并行 subagent 放到后续扩展。
- `lead-agent` 是用户入口，`coding-agent` 是可调度 worker，不反向依赖。

### Phase 6: 引入 academic profiles / soul

新增 profile 机制，但只作为行为层，不承担状态协议：

- profiles 可放在 `packages/lead-agent/profiles/` 或后续 `packages/worker-profiles/`。
- 初始 profiles：
  - researcher
  - reviewer
  - writer
  - reviser
  - method-auditor
  - citation-checker
- 每个 profile 定义 role prompt、输入要求、输出要求、acceptance checklist。
- lead-agent router 根据任务类型选择 profile；最终文本仍由 lead-agent 统一综合。

### Phase 7: 增强 artifact-core

在最小 worker 闭环稳定后新增 `packages/artifact-core`：

- 文件系统 backend + manifest。
- artifact refs、版本、lineage。
- 支持 evidence table、outline、claim audit、review comment map、revision plan、response letter draft。
- 兼容现有 `web-ui` artifact 概念：不要直接删除现有 `ArtifactMessage`，先通过 adapter 映射到 `ArtifactRef`。

## Test Plan

- 每个迁移阶段先跑相关局部测试，再跑 `npm run check`。
- `agent-host`：
  - session create/open/continue/fork/tree/compact 行为测试。
  - SDK session prompt 测试，使用 faux provider，不调用真实模型。
- `coding-agent`：
  - 现有 `packages/coding-agent/test/suite/` 全部保持通过。
  - 新增 worker adapter 测试：给定 `WorkerRequest`，返回结构化 `WorkerResult`。
  - RPC/print mode 现有语义测试保持通过。
- `agent-contracts`：
  - 类型编译测试。
  - schema/serialization round-trip 测试。
- `lead-agent`：
  - 单 agent 学术任务不派发 worker。
  - 明确 research/review task 派发 worker。
  - worker failure 进入 acceptance rejection，并返回可解释 warning/open question。
- `artifact-core`：
  - create/update/version/ref/lineage round-trip。
  - web-ui artifact adapter 不破坏现有 artifact reconstruction。

## Assumptions

- 新入口包名称采用 `lead-agent`。
- 第一轮先抽 `agent-host`，再实现 worker/lead 闭环。
- 现有 `coding-agent` CLI/SDK/RPC/TUI 行为必须保持兼容。
- 不把学术逻辑放进底层 `agent` loop。
- 不把 `coding-agent` 改成学术总控；它最终是同级 app + worker host。
- subagent workflow 是能力，不是默认写作模式；lead-agent 始终负责最终作者视角。
