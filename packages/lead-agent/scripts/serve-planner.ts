/**
 * Web UI server for planner evaluation.
 * Starts a local HTTP server with a browser interface for testing the workflow planner.
 *
 * Usage:
 *   cd packages/lead-agent
 *   npx tsx scripts/serve-planner.ts [--port 3737]
 *
 * Then open http://localhost:3737 in your browser.
 */

import { createServer } from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { createAgentHostServices } from "@mariozechner/pi-agent-host";
import type { ModelRegistry } from "@mariozechner/pi-agent-host";
import {
	createLlmWorkflowPlanner,
	createLeadTaskPlanningInput,
	WORKFLOW_TEMPLATES,
	PlannerValidationError,
} from "../src/orchestration/index.js";
import { DEFAULT_ACADEMIC_PROFILES } from "../src/index.js";
import type { LeadAgentModel } from "../src/index.js";

// ── CLI ───────────────────────────────────────────────────────────────────────

function parsePort(argv: string[]): number {
	const args = argv.slice(2);
	for (let i = 0; i < args.length; i++) {
		if ((args[i] === "--port" || args[i] === "-p") && i + 1 < args.length) {
			const p = parseInt(args[i + 1]!, 10);
			if (!isNaN(p) && p > 0 && p < 65536) return p;
		}
	}
	return 3737;
}

// ── Auth injection ────────────────────────────────────────────────────────────

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
	if (!envVar) return;
	if (process.env[envVar]) return;
	const key = await modelRegistry.getApiKeyForProvider(provider);
	if (key) process.env[envVar] = key;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function findModel(modelRegistry: ModelRegistry, modelId: string, provider: string): LeadAgentModel | undefined {
	return modelRegistry.getAvailable().find((m) => m.id === modelId && m.provider === provider);
}

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let total = 0;
		req.on("data", (chunk: unknown) => {
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
			total += buf.length;
			if (total > MAX_BODY_BYTES) {
				reject(new Error("Request body too large"));
				req.destroy();
				return;
			}
			chunks.push(buf);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
	const body = JSON.stringify(data);
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(body),
	});
	res.end(body);
}

// ── HTML ──────────────────────────────────────────────────────────────────────
// Note: inline JS intentionally avoids template literals to stay inside
// the outer TypeScript template literal safely.

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>eval-planner</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;padding:28px 32px;max-width:900px;margin:0 auto}
h1{font-size:1.2rem;font-weight:600;color:#e6edf3;margin-bottom:20px;display:flex;align-items:center;gap:10px}
h1 span{color:#388bfd;font-size:0.85rem;font-weight:400;font-family:monospace}
.form-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;margin-bottom:24px}
.form-row{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:0.75rem;color:#8b949e;letter-spacing:0.04em;text-transform:uppercase;font-weight:600}
select,textarea{background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:8px 12px;font-size:0.88rem;outline:none;transition:border-color 0.15s;font-family:inherit}
select:focus,textarea:focus{border-color:#388bfd}
select{height:38px;cursor:pointer;min-width:240px}
textarea{resize:vertical;min-height:80px;flex:1;line-height:1.55}
button{background:#238636;color:#fff;border:none;border-radius:6px;padding:0 20px;font-size:0.88rem;cursor:pointer;height:38px;white-space:nowrap;align-self:flex-end;transition:background 0.15s;font-weight:500;flex-shrink:0}
button:hover{background:#2ea043}
button:disabled{background:#21262d;color:#484f58;cursor:not-allowed}
.hint{font-size:0.73rem;color:#484f58;margin-top:10px}
.loading{display:none;align-items:center;gap:10px;color:#8b949e;font-size:0.88rem;margin-bottom:16px}
.loading.on{display:flex}
.spinner{width:16px;height:16px;border:2px solid #21262d;border-top-color:#388bfd;border-radius:50%;animation:spin 0.7s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.err{display:none;background:#160d0d;border:1px solid #6e1313;border-radius:8px;padding:14px 18px;color:#f85149;font-size:0.88rem;margin-bottom:16px}
.err.on{display:block}
.err pre{font-family:monospace;font-size:0.8rem;white-space:pre-wrap;word-break:break-word;color:#ffa198;margin-top:8px;max-height:200px;overflow:auto}
.plan-header{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:18px 22px;margin-bottom:14px;animation:fadeIn 0.2s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.badge{display:inline-flex;align-items:center;padding:3px 12px;border-radius:100px;font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px}
.badge-wf{background:#0d2644;color:#58a6ff;border:1px solid #1f4e79}
.badge-sg{background:#2e2200;color:#e3b341;border:1px solid #5c4200}
.summary{font-size:0.95rem;color:#e6edf3;margin-bottom:8px;font-weight:500;line-height:1.5}
.rationale{font-size:0.83rem;color:#8b949e;line-height:1.6}
.sec-title{font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:#8b949e;margin-bottom:10px;font-weight:700}
.step-card{background:#161b22;border:1px solid #30363d;border-left:3px solid #3fb950;border-radius:8px;padding:16px 20px;margin-bottom:10px;animation:fadeIn 0.2s ease}
.step-hd{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.step-num{background:#21262d;color:#8b949e;border-radius:4px;padding:2px 8px;font-size:0.75rem;font-weight:700;font-family:monospace}
.step-profile{color:#3fb950;font-weight:600;font-size:0.88rem}
.step-id{color:#484f58;font-size:0.75rem;font-family:monospace}
.step-obj{font-size:0.86rem;color:#c9d1d9;line-height:1.6;margin-bottom:12px}
.tag-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;align-items:center}
.tag-lbl{font-size:0.72rem;color:#8b949e;margin-right:2px;min-width:60px;flex-shrink:0}
.tag{display:inline-block;padding:2px 9px;border-radius:100px;font-size:0.72rem;font-weight:500}
.tag-art{background:#1e1040;color:#bc8cff;border:1px solid #3d2080}
.tag-out{background:#0a2040;color:#58a6ff;border:1px solid #1c4070}
.crit{margin-top:10px;padding-top:10px;border-top:1px solid #21262d}
.crit-title{font-size:0.7rem;color:#8b949e;margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
.crit-item{font-size:0.82rem;color:#8b949e;padding:3px 0 3px 16px;position:relative;line-height:1.5}
.crit-item::before{content:'\\25B8';position:absolute;left:0;color:#388bfd;font-size:0.8rem}
.stop-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;margin-top:12px;animation:fadeIn 0.2s ease}
.stop-item{font-size:0.83rem;color:#8b949e;padding:4px 0 4px 18px;position:relative;line-height:1.5}
.stop-item::before{content:'\\25C6';position:absolute;left:0;color:#388bfd;font-size:0.65rem;top:6px}
.export-bar{display:none;align-items:center;gap:8px;margin-bottom:16px;animation:fadeIn 0.2s ease}
.export-bar.on{display:flex}
.fmt-btn{background:#21262d;color:#8b949e;border:1px solid #30363d;border-radius:6px;padding:0 14px;font-size:0.8rem;cursor:pointer;height:30px;transition:all 0.15s;font-weight:500}
.fmt-btn.active{background:#0d2644;color:#58a6ff;border-color:#388bfd}
.fmt-btn:hover:not(.active){color:#c9d1d9;border-color:#8b949e}
.copy-btn{background:#21262d;color:#8b949e;border:1px solid #30363d;border-radius:6px;padding:0 16px;font-size:0.8rem;cursor:pointer;height:30px;display:flex;align-items:center;gap:6px;transition:all 0.15s;font-weight:500;margin-left:auto}
.copy-btn:hover{color:#c9d1d9;border-color:#8b949e}
.copy-btn.ok{color:#3fb950;border-color:#3fb950}
.toast{font-size:0.75rem;color:#3fb950;opacity:0;transition:opacity 0.2s}
.toast.show{opacity:1}
</style>
</head>
<body>
<h1>eval-planner <span>workflow planner evaluation</span></h1>
<div class="form-card">
  <div class="form-row">
    <div class="field">
      <label for="mdl">Model</label>
      <select id="mdl"></select>
    </div>
    <div class="field" style="flex:1">
      <label for="obj">Objective</label>
      <textarea id="obj" placeholder="Enter task objective..."></textarea>
    </div>
    <button id="btn">Plan</button>
  </div>
  <div class="hint">Cmd+Enter or Ctrl+Enter to run</div>
</div>
<div class="loading" id="loading"><div class="spinner"></div>Planning&hellip;</div>
<div class="err" id="err"><strong>Error</strong><pre id="err-txt"></pre></div>
<div class="export-bar" id="exp-bar">
  <button class="fmt-btn active" id="fmt-md" onclick="setFmt('md')">Markdown</button>
  <button class="fmt-btn" id="fmt-json" onclick="setFmt('json')">JSON</button>
  <button class="copy-btn" id="copy-btn" onclick="copyPlan()">&#128203; Copy</button>
  <span class="toast" id="toast">Copied!</span>
</div>
<div id="out"></div>
<script>
(function() {
  'use strict';

  var lastPlan = null;
  var currentFmt = 'md';

  function setFmt(fmt) {
    currentFmt = fmt;
    document.getElementById('fmt-md').className = 'fmt-btn' + (fmt === 'md' ? ' active' : '');
    document.getElementById('fmt-json').className = 'fmt-btn' + (fmt === 'json' ? ' active' : '');
  }

  function planToMarkdown(plan) {
    var lines = [];
    lines.push('# Workflow Plan');
    lines.push('');
    lines.push('**Mode:** ' + (plan.mode || ''));
    lines.push('');
    lines.push('**Summary:** ' + (plan.userVisibleSummary || ''));
    lines.push('');
    lines.push('**Rationale:** ' + (plan.rationale || ''));
    var steps = plan.steps || [];
    if (steps.length) {
      lines.push('');
      lines.push('## Steps (' + steps.length + ')');
      for (var i = 0; i < steps.length; i++) {
        var s = steps[i];
        lines.push('');
        lines.push('### [' + s.order + '] ' + (s.profileId || '') + ' (#' + (s.id || '') + ')');
        lines.push('');
        var obj = (s.objective || '').replace(/Step objective:\s*/i, '').trim();
        lines.push(obj);
        var arts = s.expectedArtifactKinds || [];
        if (arts.length) lines.push('');
        if (arts.length) lines.push('**Artifacts:** ' + arts.join(', '));
        var outs = s.expectedOutputs || [];
        if (outs.length) lines.push('');
        if (outs.length) lines.push('**Outputs:** ' + outs.join(', '));
        var crit = s.acceptanceCriteria || [];
        if (crit.length) {
          lines.push('');
          lines.push('**Acceptance criteria:**');
          for (var ci = 0; ci < crit.length; ci++) lines.push('- ' + crit[ci]);
        }
      }
    }
    var stops = plan.stopConditions || [];
    if (stops.length) {
      lines.push('');
      lines.push('## Stop Conditions');
      for (var si = 0; si < stops.length; si++) lines.push('- ' + stops[si]);
    }
    return lines.join('\\n');
  }

  function copyPlan() {
    if (!lastPlan) return;
    var text = currentFmt === 'json'
      ? JSON.stringify(lastPlan, null, 2)
      : planToMarkdown(lastPlan);
    var btn = document.getElementById('copy-btn');
    var toast = document.getElementById('toast');
    navigator.clipboard.writeText(text).then(function() {
      btn.className = 'copy-btn ok';
      toast.className = 'toast show';
      setTimeout(function() {
        btn.className = 'copy-btn';
        toast.className = 'toast';
      }, 1800);
    }).catch(function() {
      btn.textContent = 'Failed';
      setTimeout(function() { btn.textContent = 'Copy'; }, 1800);
    });
  }

  window.setFmt = setFmt;
  window.copyPlan = copyPlan;

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function mkTxt(parent, tag, cls, text) {
    var e = el(tag, cls);
    e.textContent = text;
    parent.appendChild(e);
    return e;
  }

  async function loadModels() {
    var sel = document.getElementById('mdl');
    try {
      var r = await fetch('/api/models');
      var data = await r.json();
      sel.innerHTML = '';
      var providers = Object.keys(data);
      for (var i = 0; i < providers.length; i++) {
        var prov = providers[i];
        var grp = document.createElement('optgroup');
        grp.label = prov;
        var models = data[prov];
        for (var j = 0; j < models.length; j++) {
          var m = models[j];
          var o = document.createElement('option');
          o.value = m.id + '|' + prov;
          o.textContent = m.id;
          grp.appendChild(o);
        }
        sel.appendChild(grp);
      }
    } catch(e) {
      sel.innerHTML = '<option>Failed to load models</option>';
    }
  }

  function renderPlan(plan) {
    lastPlan = plan;
    document.getElementById('exp-bar').className = 'export-bar on';
    var out = document.getElementById('out');
    out.innerHTML = '';
    var root = el('div');

    var header = el('div', 'plan-header');
    var isWf = plan.mode === 'workflow';
    var badge = el('div', 'badge ' + (isWf ? 'badge-wf' : 'badge-sg'));
    badge.textContent = plan.mode;
    header.appendChild(badge);
    mkTxt(header, 'div', 'summary', plan.userVisibleSummary || '');
    mkTxt(header, 'div', 'rationale', plan.rationale || '');
    root.appendChild(header);

    var steps = plan.steps || [];
    if (steps.length > 0) {
      mkTxt(root, 'div', 'sec-title', 'Steps (' + steps.length + ')');
      for (var i = 0; i < steps.length; i++) {
        var step = steps[i];
        var card = el('div', 'step-card');

        var sh = el('div', 'step-hd');
        mkTxt(sh, 'span', 'step-num', String(step.order));
        mkTxt(sh, 'span', 'step-profile', step.profileId || '');
        mkTxt(sh, 'span', 'step-id', '#' + (step.id || ''));
        card.appendChild(sh);

        var objText = (step.objective || '').replace(/Step objective:\s*/i, '').trim();
        mkTxt(card, 'div', 'step-obj', objText);

        var arts = step.expectedArtifactKinds || [];
        if (arts.length) {
          var artRow = el('div', 'tag-row');
          mkTxt(artRow, 'span', 'tag-lbl', 'artifacts');
          for (var ai = 0; ai < arts.length; ai++) {
            mkTxt(artRow, 'span', 'tag tag-art', arts[ai]);
          }
          card.appendChild(artRow);
        }

        var outs = step.expectedOutputs || [];
        if (outs.length) {
          var outRow = el('div', 'tag-row');
          mkTxt(outRow, 'span', 'tag-lbl', 'outputs');
          for (var oi = 0; oi < outs.length; oi++) {
            mkTxt(outRow, 'span', 'tag tag-out', outs[oi]);
          }
          card.appendChild(outRow);
        }

        var crit = step.acceptanceCriteria || [];
        if (crit.length) {
          var critDiv = el('div', 'crit');
          mkTxt(critDiv, 'div', 'crit-title', 'Acceptance criteria');
          for (var ci = 0; ci < crit.length; ci++) {
            mkTxt(critDiv, 'div', 'crit-item', crit[ci]);
          }
          card.appendChild(critDiv);
        }

        root.appendChild(card);
      }
    }

    var stops = plan.stopConditions || [];
    if (stops.length) {
      var stopCard = el('div', 'stop-card');
      mkTxt(stopCard, 'div', 'sec-title', 'Stop conditions');
      for (var si = 0; si < stops.length; si++) {
        mkTxt(stopCard, 'div', 'stop-item', stops[si]);
      }
      root.appendChild(stopCard);
    }

    out.appendChild(root);
  }

  async function runPlan() {
    var objective = document.getElementById('obj').value.trim();
    if (!objective) return;

    var parts = document.getElementById('mdl').value.split('|');
    var modelId = parts[0];
    var provider = parts[1];

    var btn = document.getElementById('btn');
    var loading = document.getElementById('loading');
    var errCard = document.getElementById('err');
    var out = document.getElementById('out');

    btn.disabled = true;
    loading.className = 'loading on';
    out.innerHTML = '';
    errCard.className = 'err';

    try {
      var r = await fetch('/api/plan', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({objective: objective, modelId: modelId, provider: provider})
      });
      var data = await r.json();
      if (!r.ok) {
        document.getElementById('err-txt').textContent = data.error || JSON.stringify(data, null, 2);
        errCard.className = 'err on';
      } else {
        renderPlan(data);
      }
    } catch(e) {
      document.getElementById('err-txt').textContent = String(e);
      errCard.className = 'err on';
    } finally {
      btn.disabled = false;
      loading.className = 'loading';
    }
  }

  document.getElementById('btn').addEventListener('click', runPlan);
  document.getElementById('obj').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runPlan();
  });

  loadModels();
})();
</script>
</body>
</html>`;

// ── Request handling ──────────────────────────────────────────────────────────

interface PlanRequestBody {
	objective?: string;
	modelId?: string;
	provider?: string;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, modelRegistry: ModelRegistry): Promise<void> {
	const { method, url } = req;

	if (method === "GET" && url === "/") {
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		res.end(HTML);
		return;
	}

	if (method === "GET" && url === "/api/models") {
		const available = modelRegistry.getAvailable();
		const byProvider: Record<string, Array<{ id: string; name?: string }>> = {};
		for (const m of available) {
			if (!byProvider[m.provider]) byProvider[m.provider] = [];
			byProvider[m.provider]!.push({ id: m.id, name: m.name });
		}
		sendJson(res, 200, byProvider);
		return;
	}

	if (method === "POST" && url === "/api/plan") {
		let body: PlanRequestBody;
		try {
			body = JSON.parse(await readBody(req)) as PlanRequestBody;
		} catch {
			sendJson(res, 400, { error: "Invalid JSON body" });
			return;
		}

		const { objective, modelId, provider } = body;
		if (!objective || !modelId || !provider) {
			sendJson(res, 400, { error: "Missing objective, modelId, or provider" });
			return;
		}

		const model = findModel(modelRegistry, modelId, provider);
		if (!model) {
			sendJson(res, 404, { error: `Model not found: ${provider}/${modelId}` });
			return;
		}

		await injectApiKey(modelRegistry, model.provider);

		const profiles = DEFAULT_ACADEMIC_PROFILES;
		const planner = createLlmWorkflowPlanner({ model, templates: WORKFLOW_TEMPLATES, profiles });
		const input = createLeadTaskPlanningInput({
			request: { objective },
			taskId: `eval-${Date.now()}`,
			sessionId: `eval-session-${Date.now()}`,
			profiles,
		});

		const PLANNER_TIMEOUT_MS = 60_000;
		const timeout = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("Planner timed out after 60s")), PLANNER_TIMEOUT_MS),
		);

		try {
			const plan = await Promise.race([planner.plan(input), timeout]);
			sendJson(res, 200, plan);
		} catch (e) {
			if (e instanceof PlannerValidationError) {
				sendJson(res, 422, {
					error: "Planner validation failed",
					firstErrors: e.firstErrors,
					secondErrors: e.secondErrors,
					firstPlan: e.firstPlan,
				});
			} else {
				sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
			}
		}
		return;
	}

	res.writeHead(404);
	res.end("Not found");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const port = parsePort(process.argv);

	const services = await createAgentHostServices({ cwd: process.cwd() });
	const modelRegistry = services.modelRegistry;

	const server = createServer((req, res) => {
		handleRequest(req, res, modelRegistry).catch((e: unknown) => {
			if (!res.headersSent) {
				sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
			}
		});
	});

	server.on("error", (err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") {
			process.stderr.write(`Port ${port} is already in use.\n`);
		} else {
			process.stderr.write(`Server error: ${err.message}\n`);
		}
		process.exit(1);
	});

	server.listen(port, "127.0.0.1", () => {
		process.stdout.write(`\neval-planner web UI\n`);
		process.stdout.write(`  http://localhost:${port}\n\n`);
		process.stdout.write(`Press Ctrl+C to stop.\n\n`);
	});
}

main().catch((e: unknown) => {
	process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
	process.exit(1);
});
