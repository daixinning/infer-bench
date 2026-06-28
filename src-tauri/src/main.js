import { getWorkspacePath, checkWorkspace, initWorkspace, setWorkspacePath, readJSON, writeJSON, jobId } from "./workspace/index.js";
import { BenchmarkEngine } from "./engine/benchmark.js";

let app, wsPath, servers = [], datasets = [], engine = null;

// ── Theme ──
const LIGHT = {
  bg:    "bg-white",
  bg2:   "bg-gray-50",
  card:  "bg-white border border-gray-200 rounded-lg shadow-sm",
  text:  "text-gray-900",
  text2: "text-gray-500",
  input: "bg-white border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200",
  btn:   "bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors",
  btn2:  "bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm transition-colors border border-gray-300",
  danger:"bg-red-500 hover:bg-red-400 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors",
};

// ── Init ──
async function init() {
  app = document.getElementById("app");
  wsPath = await getWorkspacePath();
  let info = await checkWorkspace(wsPath);
  if (!info || !info.initialized) { await initWorkspace(wsPath); await setWorkspacePath(wsPath); }
  servers = (await readJSON(wsPath + "/servers.json")) || [];
  datasets = (await readJSON(wsPath + "/datasets.json")) || [];
  render();
}

function esc(s) { return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// ── Render ──
function render() {
  const T = LIGHT;
  const serverOpts = servers.map(s => `<option value="${esc(s.name)}">${esc(s.name)} — ${esc(s.url)}</option>`).join("")
    || '<option value="">— 请先添加服务 —</option>';
  const dsOpts = datasets.map(d => `<option value="${esc(d.name)}">${esc(d.name)} (${d.requestCount}条)</option>`).join("")
    || '<option value="">— 请先添加数据集 —</option>';

  // Current dataset defaults
  const ds = datasets.length > 0 ? datasets[0] : { distribution:"uniform", requestCount:100, inputMin:512, inputMax:1024, outputMin:256, outputMax:1024 };

  app.innerHTML = `<div class="flex flex-col h-screen ${T.bg} ${T.text}">
    <header class="border-b border-gray-200 px-6 py-2.5 flex items-center justify-between ${T.bg2}">
      <div class="flex items-center gap-4">
        <h1 class="text-base font-bold text-blue-600">⚡ Bench Tool</h1>
        <div class="flex gap-2" id="quick-actions"></div>
      </div>
      <div class="flex items-center gap-3 text-xs ${T.text2}">
        <button id="btn-settings" class="hover:text-gray-700">⚙</button>
        <span id="ws-label">${wsPath}</span>
      </div>
    </header>

    <main class="flex-1 overflow-auto p-4">
      <div class="grid grid-cols-2 gap-4 max-w-5xl mx-auto">

        <!-- LEFT: Servers + Datasets -->
        <div class="space-y-4">
          <!-- Servers -->
          <div class="${T.card} p-4">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-semibold">推理服务</h3>
              <button id="btn-add-server" class="${T.btn2} text-xs">+ 添加</button>
            </div>
            <select id="sel-server" class="w-full ${T.input}">${serverOpts}</select>
            <div class="flex gap-2 mt-2">
              <button id="btn-test" class="${T.btn2} text-xs" ${servers.length===0?"disabled":""}>测试连接</button>
              <button id="btn-del-server" class="text-red-400 hover:text-red-600 text-xs" ${servers.length===0?"hidden":""}>删除</button>
              <span id="test-result" class="text-xs self-center"></span>
            </div>
          </div>

          <!-- Dataset -->
          <div class="${T.card} p-4">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-semibold">数据集</h3>
              <button id="btn-add-ds" class="${T.btn2} text-xs">+ 新建</button>
            </div>
            <select id="sel-dataset" class="w-full ${T.input} mb-3">${dsOpts}</select>
            <div class="grid grid-cols-2 gap-2 mb-2">
              <div><label class="text-xs ${T.text2}">分布</label>
                <select id="ds-distribution" class="w-full ${T.input}">
                  <option value="uniform" ${ds.distribution==="uniform"?"selected":""}>uniform</option>
                  <option value="gaussian" ${ds.distribution==="gaussian"?"selected":""}>gaussian</option>
                  <option value="zipf" ${ds.distribution==="zipf"?"selected":""}>zipf</option></select></div>
              <div><label class="text-xs ${T.text2}">请求数</label>
                <input id="ds-count" type="number" value="${ds.requestCount}" min="1" class="w-full ${T.input}"></div>
            </div>
            <div class="text-xs ${T.text2} mb-1">Token 长度</div>
            <div class="grid grid-cols-4 gap-2">
              <div><label class="text-xs ${T.text2}">输入min</label><input id="ds-in-min" type="number" value="${ds.inputMin}" min="1" class="w-full ${T.input}"></div>
              <div><label class="text-xs ${T.text2}">输入max</label><input id="ds-in-max" type="number" value="${ds.inputMax}" min="1" class="w-full ${T.input}"></div>
              <div><label class="text-xs ${T.text2}">输出min</label><input id="ds-out-min" type="number" value="${ds.outputMin}" min="1" class="w-full ${T.input}"></div>
              <div><label class="text-xs ${T.text2}">输出max</label><input id="ds-out-max" type="number" value="${ds.outputMax}" min="1" class="w-full ${T.input}"></div>
            </div>
            <div class="flex gap-2 mt-2">
              <button id="btn-save-ds" class="${T.btn2} text-xs">保存当前</button>
              <button id="btn-del-ds" class="text-red-400 hover:text-red-600 text-xs" ${datasets.length===0?"hidden":""}>删除</button>
            </div>
          </div>
        </div>

        <!-- RIGHT: Benchmark config + controls -->
        <div class="space-y-4">
          <div class="${T.card} p-4">
            <h3 class="text-sm font-semibold mb-3">压测参数</h3>
            <div class="grid grid-cols-3 gap-2 mb-2">
              <div><label class="text-xs ${T.text2}">总并发</label><input id="bench-concurrency" type="number" value="32" min="1" class="w-full ${T.input}"></div>
              <div><label class="text-xs ${T.text2}">Prefill</label><input id="bench-prefill" type="number" value="4" min="1" class="w-full ${T.input}"></div>
              <div><label class="text-xs ${T.text2}">速率req/s</label><input id="bench-rate" type="number" value="0" min="0" class="w-full ${T.input}"></div>
            </div>
            <div class="grid grid-cols-3 gap-2 mb-2">
              <div><label class="text-xs ${T.text2}">预热数</label><input id="bench-warmup" type="number" value="0" min="0" class="w-full ${T.input}"></div>
              <div><label class="text-xs ${T.text2}">Temperature</label><input id="bench-temp" type="number" value="0.6" min="0" max="2" step="0.1" class="w-full ${T.input}"></div>
              <div><label class="text-xs ${T.text2}">Top-P</label><input id="bench-top-p" type="number" value="0.95" min="0" max="1" step="0.01" class="w-full ${T.input}"></div>
            </div>
            <div class="flex items-center gap-4">
              <label class="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" id="bench-stream" checked> Streaming</label>
              <div><label class="text-xs ${T.text2}">Max Tokens</label><input id="bench-max-tokens" type="number" value="1024" min="1" class="w-24 ${T.input} ml-1"></div>
            </div>
            <div class="flex gap-2 mt-3">
              <button id="bench-start" class="${T.btn}">▶ 开始</button>
              <button id="bench-stop" class="${T.danger} hidden">⏹ 停止</button>
              <span id="bench-phase" class="self-center text-xs text-orange-500 hidden"></span>
            </div>
          </div>

          <!-- Live metrics -->
          <div id="bench-dashboard" class="${T.card} p-4 hidden">
            <div class="mb-3">
              <div class="flex justify-between text-xs mb-1"><span class="${T.text2}">进度</span><span id="bench-progress-text" class="text-blue-600">0/0</span></div>
              <div class="w-full bg-gray-200 rounded-full h-1.5"><div id="bench-progress-bar" class="bg-blue-500 rounded-full h-1.5 transition-all" style="width:0%"></div></div>
            </div>
            <div class="grid grid-cols-5 gap-2 mb-3">
              <div class="text-center p-2 rounded bg-gray-50"><div class="text-xs ${T.text2}">吞吐量</div><div id="metric-throughput" class="text-lg font-mono text-blue-600">--</div><div class="text-xs ${T.text2}">req/s</div></div>
              <div class="text-center p-2 rounded bg-gray-50"><div class="text-xs ${T.text2}">Token/s</div><div id="metric-tokens" class="text-lg font-mono text-green-600">--</div></div>
              <div class="text-center p-2 rounded bg-gray-50"><div class="text-xs ${T.text2}">TTFT</div><div id="metric-ttft" class="text-lg font-mono text-orange-600">--</div><div class="text-xs ${T.text2}">ms</div></div>
              <div class="text-center p-2 rounded bg-gray-50"><div class="text-xs ${T.text2}">处理中</div><div id="metric-inflight" class="text-lg font-mono text-purple-600">--</div></div>
              <div class="text-center p-2 rounded bg-gray-50"><div class="text-xs ${T.text2}">成功率</div><div id="metric-success" class="text-lg font-mono text-green-600">--</div><div class="text-xs ${T.text2}">%</div></div>
            </div>
            <table class="w-full text-xs"><thead><tr class="${T.text2} text-left"><th>指标</th><th>P50</th><th>P90</th><th>P95</th><th>P99</th><th>Avg</th></tr></thead>
              <tbody id="latency-table" class="font-mono"></tbody></table>
          </div>
        </div>
      </div>

      <!-- Reports -->
      <div id="reports-section" class="max-w-5xl mx-auto mt-6"></div>
    </main>

    <footer class="border-t border-gray-200 px-6 py-1.5 flex justify-between text-xs ${T.text2} ${T.bg2}">
      <span id="status-text">就绪</span><span>v0.1</span>
    </footer>

    <!-- Modals -->
    <div id="modal-overlay" class="hidden fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div id="modal-content" class="bg-white rounded-xl p-5 w-[420px] shadow-xl border border-gray-200"></div>
    </div>
  </div>`;

  bindEvents();
  loadReports();
}

// ── Events ──
function bindEvents() {
  const T = LIGHT;

  // Server: test connection
  document.getElementById("btn-test").onclick = async () => {
    const sel = document.getElementById("sel-server");
    const s = servers.find(s => s.name === sel.value);
    if (!s) return;
    const btn = document.getElementById("btn-test");
    const res = document.getElementById("test-result");
    btn.disabled = true; res.textContent = "测试中..."; res.className = "text-xs text-gray-500";
    try {
      const headers = { "Content-Type": "application/json" };
      if (s.apiKey) headers["Authorization"] = "Bearer " + s.apiKey;
      const resp = await fetch(s.url + "/chat/completions", { method: "POST", headers, body: JSON.stringify({ model: s.model || "", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }) });
      res.textContent = resp.ok ? "✓ 连接成功" : "✗ " + resp.status;
      res.className = "text-xs " + (resp.ok ? "text-green-600" : "text-yellow-600");
    } catch (e) { res.textContent = "✗ " + e.message; res.className = "text-xs text-red-500"; }
    btn.disabled = false;
  };

  // Server: add modal
  document.getElementById("btn-add-server").onclick = () => showModal("添加推理服务", `
    <form id="frm-server" class="space-y-2">
      <input name="name" required placeholder="名称" class="w-full ${T.input}">
      <input name="url" required placeholder="API地址 http://..." class="w-full ${T.input}">
      <input name="model" placeholder="模型名称 (可选)" class="w-full ${T.input}">
      <input name="apiKey" type="password" placeholder="API Key (可选)" class="w-full ${T.input}">
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" onclick="document.getElementById('modal-overlay').classList.add('hidden')" class="${T.btn2}">取消</button>
        <button type="submit" class="${T.btn}">保存</button></div></form>`);
  document.getElementById("frm-server").onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target);
    servers.push({ name: fd.get("name"), url: fd.get("url"), model: fd.get("model")||"", apiKey: fd.get("apiKey")||"" });
    await writeJSON(wsPath+"/servers.json", servers); hideModal(); render();
  };

  // Server: delete
  document.getElementById("btn-del-server").onclick = async () => {
    const n = document.getElementById("sel-server").value;
    servers = servers.filter(s => s.name !== n);
    await writeJSON(wsPath+"/servers.json", servers); render();
  };

  // Dataset: select → load fields
  document.getElementById("sel-dataset").onchange = () => {
    const ds = datasets.find(d => d.name === document.getElementById("sel-dataset").value);
    if (!ds) return;
    document.getElementById("ds-distribution").value = ds.distribution;
    document.getElementById("ds-count").value = ds.requestCount;
    document.getElementById("ds-in-min").value = ds.inputMin;
    document.getElementById("ds-in-max").value = ds.inputMax;
    document.getElementById("ds-out-min").value = ds.outputMin;
    document.getElementById("ds-out-max").value = ds.outputMax;
  };

  // Dataset: save current
  document.getElementById("btn-save-ds").onclick = async () => {
    const ds = {
      name: document.getElementById("sel-dataset").value || "default",
      distribution: document.getElementById("ds-distribution").value,
      requestCount: parseInt(document.getElementById("ds-count").value),
      inputMin: parseInt(document.getElementById("ds-in-min").value),
      inputMax: parseInt(document.getElementById("ds-in-max").value),
      outputMin: parseInt(document.getElementById("ds-out-min").value),
      outputMax: parseInt(document.getElementById("ds-out-max").value),
    };
    const idx = datasets.findIndex(d => d.name === ds.name);
    if (idx >= 0) datasets[idx] = ds; else datasets.push(ds);
    await writeJSON(wsPath+"/datasets.json", datasets); render();
  };

  // Dataset: delete
  document.getElementById("btn-del-ds").onclick = async () => {
    const n = document.getElementById("sel-dataset").value;
    datasets = datasets.filter(d => d.name !== n);
    await writeJSON(wsPath+"/datasets.json", datasets); render();
  };

  // Dataset: add modal
  document.getElementById("btn-add-ds").onclick = () => showModal("新建数据集", `
    <form id="frm-ds" class="space-y-2">
      <input name="name" required placeholder="名称" class="w-full ${T.input}">
      <select name="distribution" class="w-full ${T.input}">
        <option value="uniform">uniform</option><option value="gaussian">gaussian</option><option value="zipf">zipf</option></select>
      <div class="grid grid-cols-2 gap-2">
        <input name="inputMin" type="number" value="512" placeholder="输入min" class="w-full ${T.input}">
        <input name="inputMax" type="number" value="1024" placeholder="输入max" class="w-full ${T.input}">
        <input name="outputMin" type="number" value="256" placeholder="输出min" class="w-full ${T.input}">
        <input name="outputMax" type="number" value="1024" placeholder="输出max" class="w-full ${T.input}"></div>
      <input name="requestCount" type="number" value="100" placeholder="请求数" class="w-full ${T.input}">
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" onclick="document.getElementById('modal-overlay').classList.add('hidden')" class="${T.btn2}">取消</button>
        <button type="submit" class="${T.btn}">保存</button></div></form>`);
  document.getElementById("frm-ds").onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target);
    datasets.push({
      name: fd.get("name"), distribution: fd.get("distribution"),
      requestCount: parseInt(fd.get("requestCount")), inputMin: parseInt(fd.get("inputMin")),
      inputMax: parseInt(fd.get("inputMax")), outputMin: parseInt(fd.get("outputMin")),
      outputMax: parseInt(fd.get("outputMax")),
    });
    await writeJSON(wsPath+"/datasets.json", datasets); hideModal(); render();
  };

  // Benchmark: start
  document.getElementById("bench-start").onclick = () => startBenchmark();
  document.getElementById("bench-stop").onclick = () => { if (engine) engine.stop(); onStopped(); };
  document.getElementById("btn-settings").onclick = () => showModal("工作区路径", `
    <div class="space-y-2">
      <input id="settings-path" value="${esc(wsPath)}" class="w-full ${T.input}">
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" onclick="document.getElementById('modal-overlay').classList.add('hidden')" class="${T.btn2}">取消</button>
        <button id="btn-save-ws" class="${T.btn}">保存</button></div></div>`);
  document.getElementById("btn-save-ws").onclick = async () => {
    wsPath = document.getElementById("settings-path").value;
    await setWorkspacePath(wsPath);
    let info = await checkWorkspace(wsPath);
    if (!info.initialized) await initWorkspace(wsPath);
    servers = (await readJSON(wsPath+"/servers.json")) || [];
    datasets = (await readJSON(wsPath+"/datasets.json")) || [];
    hideModal(); render();
  };
}

// ── Benchmark ──
async function startBenchmark() {
  const sName = document.getElementById("sel-server").value;
  const dName = document.getElementById("sel-dataset").value;
  const server = servers.find(s => s.name === sName);
  const dataset = datasets.find(d => d.name === dName);
  if (!server || !dataset) { statusMsg("请选择服务和数据集"); return; }

  const config = {
    server, dataset,
    concurrency: +document.getElementById("bench-concurrency").value,
    prefillConcurrency: +document.getElementById("bench-prefill").value,
    rate: +document.getElementById("bench-rate").value,
    warmup: +document.getElementById("bench-warmup").value,
    stream: document.getElementById("bench-stream").checked,
    maxTokens: +document.getElementById("bench-max-tokens").value,
    temperature: +document.getElementById("bench-temp").value,
    topP: +document.getElementById("bench-top-p").value,
  };

  document.getElementById("bench-start").classList.add("hidden");
  document.getElementById("bench-stop").classList.remove("hidden");
  document.getElementById("bench-dashboard").classList.remove("hidden");

  const jobDir = wsPath + "/jobs/" + jobId();
  await writeJSON(jobDir + "/servers.json", server);
  await writeJSON(jobDir + "/config.json", config);

  engine = new BenchmarkEngine(config);
  let allMetrics = [];
  const startTime = Date.now();

  engine.onProgress(p => {
    updateDashboard(p, startTime);
    allMetrics.push(...p.completed);
  });

  engine.onComplete(async () => {
    await writeJSON(jobDir + "/requests.jsonl", allMetrics);
    const summary = computeSummary(allMetrics, config);
    await writeJSON(jobDir + "/summary.json", summary);
    statusMsg("压测完成");
    onStopped();
    loadReports();
  });

  engine.onError(err => {
    statusMsg("错误: " + err);
    onStopped();
  });

  engine.start();
}

function updateDashboard(p, startTime) {
  const phaseEl = document.getElementById("bench-phase");
  if (p.phase === "warmup") {
    phaseEl.classList.remove("hidden");
    phaseEl.textContent = `预热 ${p.warmupDone}/${p.warmupTotal}`;
    document.getElementById("bench-progress-text").textContent = `预热 ${p.warmupDone}/${p.warmupTotal}`;
    document.getElementById("bench-progress-bar").style.width = (p.warmupTotal>0 ? p.warmupDone/p.warmupTotal*100 : 0) + "%";
  } else {
    phaseEl.classList.add("hidden");
    const done = p.done + p.failed;
    document.getElementById("bench-progress-text").textContent = done + "/" + p.total;
    document.getElementById("bench-progress-bar").style.width = (p.total>0 ? done/p.total*100 : 0) + "%";
  }
  if (p.completed.length > 0) {
    const ms = p.completed;
    const elapsed = (Date.now() - startTime) / 1000;
    const tp = elapsed > 0 ? ms.length / elapsed : 0;
    const tokens = ms.reduce((s, m) => s + (m.outputTokens || 0), 0);
    const tps = elapsed > 0 ? tokens / elapsed : 0;
    const ttfts = ms.map(m => m.ttft).filter(t => t > 0);
    const avgTTFT = ttfts.length > 0 ? ttfts.reduce((a, b) => a + b, 0) / ttfts.length : 0;
    const sc = ms.filter(m => m.success).length;
    const sr = ms.length > 0 ? (sc / ms.length * 100) : 100;
    document.getElementById("metric-throughput").textContent = tp.toFixed(1);
    document.getElementById("metric-tokens").textContent = tps.toFixed(0);
    document.getElementById("metric-ttft").textContent = avgTTFT.toFixed(0);
    document.getElementById("metric-success").textContent = sr.toFixed(1);
    document.getElementById("metric-inflight").textContent = String(p.inflight || 0);
  }
}

function onStopped() {
  document.getElementById("bench-start").classList.remove("hidden");
  document.getElementById("bench-stop").classList.add("hidden");
  document.getElementById("bench-phase").classList.add("hidden");
}

// ── Summary ──
function computeSummary(metrics, config) {
  const success = metrics.filter(m => m.success);
  const ttfts = success.map(m => m.ttft).sort((a,b)=>a-b);
  const totals = success.map(m => m.total).sort((a,b)=>a-b);
  function p(arr, q) { return arr.length>0 ? arr[Math.floor(arr.length*q)].toFixed(0) : "0"; }
  function avg(arr) { return arr.length>0 ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(0) : "0"; }
  return {
    total: metrics.length, success: success.length, failed: metrics.length - success.length,
    stats: {
      ttft: { p50:p(ttfts,.5), p90:p(ttfts,.9), p95:p(ttfts,.95), p99:p(ttfts,.99), avg:avg(ttfts) },
      total: { p50:p(totals,.5), p90:p(totals,.9), p95:p(totals,.95), p99:p(totals,.99), avg:avg(totals) },
    },
    timestamp: new Date().toISOString(),
  };
}

// ── Reports ──
async function loadReports() {
  const section = document.getElementById("reports-section");
  const jobs = [];
  const resp = await window.__TAURI__ ? window.__TAURI__.invoke("list_dir", { path: wsPath + "/jobs" }) : null;
  if (!resp) { section.innerHTML = ""; return; }
  for (const dir of (resp || [])) {
    try { 
      const s = await readJSON(wsPath + "/jobs/" + dir + "/summary.json");
      if (s) jobs.push({ dir, ...s });
    } catch (_) {}
  }
  jobs.sort((a, b) => b.dir.localeCompare(a.dir));
  if (jobs.length === 0) { section.innerHTML = ""; return; }

  const T = LIGHT;
  section.innerHTML = `<div class="${T.card} p-4">
    <h3 class="text-sm font-semibold mb-2">历史报告 (最近${Math.min(jobs.length,5)}个)</h3>
    <div class="space-y-1">
      ${jobs.slice(0,5).map(j => `<div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 text-xs">
        <span class="font-mono ${T.text2}">${j.dir}</span>
        <span>${j.success}/${j.total} 成功</span>
        <span>TTFT p50: ${j.stats.ttft.p50}ms</span>
        <span>p99: ${j.stats.ttft.p99}ms</span>
        <span>Avg: ${j.stats.ttft.avg}ms</span>
      </div>`).join("")}
    </div>
  </div>`;
}

// ── Modal ──
function showModal(title, body) {
  document.getElementById("modal-content").innerHTML = `<h3 class="text-base font-semibold mb-3">${title}</h3>${body}`;
  document.getElementById("modal-overlay").classList.remove("hidden");
}
function hideModal() { document.getElementById("modal-overlay").classList.add("hidden"); }
function statusMsg(msg) { const el = document.getElementById("status-text"); if (el) el.textContent = msg; }

init();
