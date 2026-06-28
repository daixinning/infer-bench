import { getWorkspacePath, checkWorkspace, initWorkspace, setWorkspacePath, readJSON, writeJSON, jobId } from "./workspace/index.js";
import { BenchmarkEngine } from "./engine/benchmark.js";

let app, wsPath, servers = [], datasets = [], engine = null, logLines = [];

// ── Theme: light, compact ──
const C = {
  input: "bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200",
  select:"bg-white border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500",
  btn:   "bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors",
  btn2:  "bg-white hover:bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-xs transition-colors border border-gray-300",
  danger:"bg-red-500 hover:bg-red-400 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors",
  card:  "bg-white border border-gray-200 rounded-lg p-3",
  label: "text-xs text-gray-500",
};

function esc(s) { return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

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

// ── Render ──
function render() {
  const serverOpts = servers.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");
  const dsOpts = datasets.map(d => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join("");
  const ds = datasets.length > 0 ? datasets[0] : { distribution:"uniform", requestCount:100, inputMin:512, inputMax:1024, outputMin:256, outputMax:1024 };

  app.innerHTML = `<div class="flex flex-col h-screen bg-gray-50 text-gray-900 text-xs">
    <!-- Row 1: Server URL + Model + Key + Workspace -->
    <div class="${C.card} mx-3 mt-3">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="${C.label} font-semibold w-12">服务</span>
        <input id="svc-url" placeholder="http://10.0.0.5:8000/v1" class="${C.input} flex-1 min-w-[240px]">
        <input id="svc-model" placeholder="模型(可选)" class="${C.input} w-28">
        <input id="svc-key" type="password" placeholder="API Key(可选)" class="${C.input} w-36">
        <button id="btn-test" class="${C.btn2}">测试连接</button>
        <span id="test-result" class="text-xs"></span>
        <span class="${C.label} ml-4">工作目录</span>
        <input id="svc-ws" class="${C.input} w-48" value="${esc(wsPath)}">
        <button id="btn-ws" class="${C.btn2}">切换</button>
      </div>
    </div>

    <!-- Row 2: Dataset -->
    <div class="${C.card} mx-3 mt-2">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="${C.label} font-semibold w-12">数据集</span>
        <select id="sel-ds" class="${C.select} w-40">${dsOpts || '<option>— 新建 —</option>'}</select>
        <select id="ds-dist" class="${C.select} w-24">
          <option value="uniform" ${ds.distribution==="uniform"?"selected":""}>uniform</option>
          <option value="gaussian" ${ds.distribution==="gaussian"?"selected":""}>gaussian</option>
          <option value="zipf" ${ds.distribution==="zipf"?"selected":""}>zipf</option></select>
        <span class="${C.label}">请求数</span>
        <input id="ds-count" type="number" value="${ds.requestCount}" min="1" class="${C.input} w-16">
        <span class="${C.label} ml-2">输入tokens</span>
        <input id="ds-in-min" type="number" value="${ds.inputMin}" min="1" class="${C.input} w-16">
        <span class="${C.label}">-</span>
        <input id="ds-in-max" type="number" value="${ds.inputMax}" min="1" class="${C.input} w-16">
        <span class="${C.label} ml-2">输出tokens</span>
        <input id="ds-out-min" type="number" value="${ds.outputMin}" min="1" class="${C.input} w-16">
        <span class="${C.label}">-</span>
        <input id="ds-out-max" type="number" value="${ds.outputMax}" min="1" class="${C.input} w-16">
        <button id="btn-save-ds" class="${C.btn2} ml-2">保存</button>
        <button id="btn-del-ds" class="text-red-400 hover:text-red-600 text-xs ml-1" ${datasets.length===0?"hidden":""}>删除</button>
      </div>
    </div>

    <!-- Row 3-4: Benchmark params -->
    <div class="${C.card} mx-3 mt-2">
      <div class="flex items-center gap-3 flex-wrap">
        <span class="${C.label} font-semibold w-12">参数</span>
        <span class="${C.label}">并发</span><input id="bench-concurrency" type="number" value="32" min="1" class="${C.input} w-16">
        <span class="${C.label}">Prefill</span><input id="bench-prefill" type="number" value="4" min="1" class="${C.input} w-16">
        <span class="${C.label}">速率</span><input id="bench-rate" type="number" value="0" min="0" class="${C.input} w-16"><span class="${C.label}">req/s</span>
        <span class="${C.label} ml-2">预热</span><input id="bench-warmup" type="number" value="0" min="0" class="${C.input} w-14">
        <span class="${C.label} ml-2">Temp</span><input id="bench-temp" type="number" value="0.6" min="0" max="2" step="0.1" class="${C.input} w-14">
        <span class="${C.label}">Top-P</span><input id="bench-top-p" type="number" value="0.95" min="0" max="1" step="0.01" class="${C.input} w-14">
        <span class="${C.label} ml-2">MaxTokens</span><input id="bench-max-tokens" type="number" value="1024" min="1" class="${C.input} w-16">
        <label class="inline-flex items-center gap-1 ml-2"><input type="checkbox" id="bench-stream" checked> Stream</label>
        <button id="bench-start" class="${C.btn} ml-3">▶ 开始</button>
        <button id="bench-stop" class="${C.danger} hidden">⏹ 停止</button>
        <span id="bench-phase" class="text-orange-500 hidden"></span>
        <span id="bench-progress-text" class="text-blue-600 font-mono ml-2"></span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-1 mt-2 hidden" id="progress-wrap"><div id="bench-progress-bar" class="bg-blue-500 rounded-full h-1 transition-all" style="width:0%"></div></div>
    </div>

    <!-- Output: metrics + logs (two columns) -->
    <div class="flex-1 overflow-hidden mx-3 mt-2 mb-3 flex gap-2 min-h-0">
      <!-- Left: Metrics dashboard -->
      <div id="output-metrics" class="flex-1 flex flex-col gap-2 overflow-auto">
        <div id="bench-dashboard" class="${C.card} hidden">
          <div class="grid grid-cols-5 gap-2 mb-2">
            <div class="text-center p-1.5 rounded bg-gray-50"><div class="${C.label}">吞吐</div><div id="metric-throughput" class="text-base font-mono text-blue-600">--</div><div class="${C.label}">req/s</div></div>
            <div class="text-center p-1.5 rounded bg-gray-50"><div class="${C.label}">Token/s</div><div id="metric-tokens" class="text-base font-mono text-green-600">--</div></div>
            <div class="text-center p-1.5 rounded bg-gray-50"><div class="${C.label}">TTFT</div><div id="metric-ttft" class="text-base font-mono text-orange-600">--</div><div class="${C.label}">ms</div></div>
            <div class="text-center p-1.5 rounded bg-gray-50"><div class="${C.label}">处理中</div><div id="metric-inflight" class="text-base font-mono text-purple-600">--</div></div>
            <div class="text-center p-1.5 rounded bg-gray-50"><div class="${C.label}">成功率</div><div id="metric-success" class="text-base font-mono text-green-600">--</div><div class="${C.label}">%</div></div>
          </div>
          <table class="w-full text-xs"><thead><tr class="${C.label} text-left"><th>指标</th><th>P50</th><th>P90</th><th>P95</th><th>P99</th><th>Avg</th></tr></thead>
            <tbody id="latency-table" class="font-mono"></tbody></table>
        </div>
        <div id="history-section"></div>
      </div>
      <!-- Right: Process log -->
      <div id="output-log" class="w-80 ${C.card} overflow-auto flex flex-col">
        <div class="${C.label} font-semibold mb-1 sticky top-0 bg-white pb-1 border-b border-gray-100">过程日志</div>
        <div id="log-lines" class="flex-1 font-mono text-xs space-y-0.5 overflow-auto"></div>
      </div>
    </div>
  </div>`;

  bindEvents();
  loadHistory();
  if (ds.distribution) dsSelChanged(); // load defaults
}

// ── Events ──
function bindEvents() {
  // Workspace switch
  document.getElementById("btn-ws").onclick = async () => {
    const p = document.getElementById("svc-ws").value;
    await setWorkspacePath(p); let info = await checkWorkspace(p);
    if (!info.initialized) await initWorkspace(p);
    wsPath = p; servers = (await readJSON(wsPath+"/servers.json"))||[];
    datasets = (await readJSON(wsPath+"/datasets.json"))||[]; render();
  };

  // Test connection
  document.getElementById("btn-test").onclick = async () => {
    const btn = document.getElementById("btn-test"); const res = document.getElementById("test-result");
    btn.disabled = true; res.textContent = "测试中..."; res.className = "text-xs text-gray-500";
    try {
      const headers = { "Content-Type":"application/json" };
      const key = document.getElementById("svc-key").value;
      if (key) headers["Authorization"] = "Bearer "+key;
      const url = document.getElementById("svc-url").value;
      const model = document.getElementById("svc-model").value;
      const resp = await fetch(url+"/chat/completions", { method:"POST", headers, body: JSON.stringify({ model, messages:[{role:"user",content:"ping"}], max_tokens:1 }) });
      res.textContent = resp.ok ? "✓ 成功" : "✗ "+resp.status;
      res.className = "text-xs "+(resp.ok?"text-green-600":"text-yellow-600");
    } catch(e) { res.textContent = "✗ "+e.message; res.className = "text-xs text-red-500"; }
    btn.disabled = false;
  };

  // Dataset: select → fill fields
  document.getElementById("sel-ds").onchange = dsSelChanged;
  function dsSelChanged() {
    const n = document.getElementById("sel-ds").value;
    const ds = datasets.find(d => d.name === n);
    if (!ds) return;
    document.getElementById("ds-dist").value = ds.distribution;
    document.getElementById("ds-count").value = ds.requestCount;
    document.getElementById("ds-in-min").value = ds.inputMin;
    document.getElementById("ds-in-max").value = ds.inputMax;
    document.getElementById("ds-out-min").value = ds.outputMin;
    document.getElementById("ds-out-max").value = ds.outputMax;
  }

  // Dataset: save
  document.getElementById("btn-save-ds").onclick = async () => {
    const n = document.getElementById("sel-ds").value || "default";
    const ds = { name:n, distribution:document.getElementById("ds-dist").value,
      requestCount:+document.getElementById("ds-count").value, inputMin:+document.getElementById("ds-in-min").value,
      inputMax:+document.getElementById("ds-in-max").value, outputMin:+document.getElementById("ds-out-min").value,
      outputMax:+document.getElementById("ds-out-max").value };
    const idx = datasets.findIndex(d => d.name === n);
    if (idx>=0) datasets[idx]=ds; else datasets.push(ds);
    await writeJSON(wsPath+"/datasets.json", datasets); render();
  };
  document.getElementById("btn-del-ds").onclick = async () => {
    datasets = datasets.filter(d => d.name !== document.getElementById("sel-ds").value);
    await writeJSON(wsPath+"/datasets.json", datasets); render();
  };

  // Benchmark
  document.getElementById("bench-start").onclick = startBenchmark;
  document.getElementById("bench-stop").onclick = () => { if(engine) engine.stop(); onStopped(); };
}

// ── Benchmark ──
async function startBenchmark() {
  const url = document.getElementById("svc-url").value.trim();
  if (!url) { addLog("❌ 请输入服务URL"); return; }

  const dsName = document.getElementById("sel-ds").value;
  const dataset = datasets.find(d => d.name === dsName) || {
    name: dsName || "adhoc", distribution: document.getElementById("ds-dist").value,
    requestCount: +document.getElementById("ds-count").value,
    inputMin: +document.getElementById("ds-in-min").value, inputMax: +document.getElementById("ds-in-max").value,
    outputMin: +document.getElementById("ds-out-min").value, outputMax: +document.getElementById("ds-out-max").value,
  };

  const server = {
    name: "current", url,
    model: document.getElementById("svc-model").value,
    apiKey: document.getElementById("svc-key").value,
  };

  const config = { server, dataset,
    concurrency: +document.getElementById("bench-concurrency").value,
    prefillConcurrency: +document.getElementById("bench-prefill").value,
    rate: +document.getElementById("bench-rate").value,
    warmup: +document.getElementById("bench-warmup").value,
    stream: document.getElementById("bench-stream").checked,
    maxTokens: +document.getElementById("bench-max-tokens").value,
    temperature: +document.getElementById("bench-temp").value,
    topP: +document.getElementById("bench-top-p").value,
  };

  logLines = [];
  document.getElementById("bench-start").classList.add("hidden");
  document.getElementById("bench-stop").classList.remove("hidden");
  document.getElementById("bench-dashboard").classList.remove("hidden");
  document.getElementById("progress-wrap").classList.remove("hidden");
  document.getElementById("log-lines").innerHTML = "";

  addLog(`开始压测: ${url}  请求数=${dataset.requestCount}  并发=${config.concurrency}`);
  addLog(`输入tokens: ${dataset.inputMin}-${dataset.inputMax}  输出tokens: ${dataset.outputMin}-${dataset.outputMax}`);

  const jobDir = wsPath + "/jobs/" + jobId();
  await writeJSON(jobDir+"/servers.json", server);
  await writeJSON(jobDir+"/config.json", config);

  engine = new BenchmarkEngine(config);
  let allMetrics = [];
  const startTime = Date.now();

  engine.onLog(entry => {
    if (entry.type === "start") { addLog(`[${entry.id}] 开始...`); return; }
    if (entry.type === "ok") { addLog(`[${entry.id}] ✓ TTFT=${entry.ttft}ms  output=${entry.outputTokens}  total=${entry.total}ms`); return; }
    if (entry.type === "fail") { addLog(`[${entry.id}] ✗ ${entry.error||"失败"}`); }
  });

  engine.onProgress(p => {
    updateDashboard(p, startTime);
    if (p.completed) allMetrics.push(...p.completed);
  });

  engine.onComplete(async () => {
    await writeJSON(jobDir+"/requests.jsonl", allMetrics);
    const summary = computeSummary(allMetrics, config);
    await writeJSON(jobDir+"/summary.json", summary);
    addLog(`\n──── 完成 ────`);
    addLog(`总请求: ${summary.total}  成功: ${summary.success}  失败: ${summary.failed}`);
    addLog(`TTFT P50=${summary.stats.ttft.p50}ms  P99=${summary.stats.ttft.p99}ms  Avg=${summary.stats.ttft.avg}ms`);
    addLog(`Total P50=${summary.stats.total.p50}ms  P99=${summary.stats.total.p99}ms`);
    onStopped();
    loadHistory();
  });

  engine.onError(err => { addLog("❌ 错误: "+err); onStopped(); });
  engine.start();
}

function updateDashboard(p, startTime) {
  const ph = document.getElementById("bench-phase");
  const pText = document.getElementById("bench-progress-text");
  const pBar = document.getElementById("bench-progress-bar");
  if (p.phase === "warmup") {
    ph.classList.remove("hidden"); ph.textContent = `预热 ${p.warmupDone}/${p.warmupTotal}`;
    pText.textContent = `预热 ${p.warmupDone}/${p.warmupTotal}`;
    pBar.style.width = (p.warmupTotal>0?p.warmupDone/p.warmupTotal*100:0)+"%";
  } else {
    ph.classList.add("hidden");
    const done = p.done + p.failed;
    pText.textContent = done+"/"+p.total;
    pBar.style.width = (p.total>0?done/p.total*100:0)+"%";
  }
  if (p.completed && p.completed.length) {
    const ms = p.completed;
    const elapsed = (Date.now()-startTime)/1000;
    document.getElementById("metric-throughput").textContent = (elapsed>0?ms.length/elapsed:0).toFixed(1);
    const tokens = ms.reduce((s,m)=>s+(m.outputTokens||0),0);
    document.getElementById("metric-tokens").textContent = (elapsed>0?tokens/elapsed:0).toFixed(0);
    const ttfts = ms.map(m=>m.ttft).filter(t=>t>0);
    document.getElementById("metric-ttft").textContent = ttfts.length?((ttfts.reduce((a,b)=>a+b,0)/ttfts.length).toFixed(0)):"--";
    document.getElementById("metric-success").textContent = (ms.filter(m=>m.success).length/ms.length*100).toFixed(1);
    document.getElementById("metric-inflight").textContent = String(p.inflight||0);
  }
}

function onStopped() {
  document.getElementById("bench-start").classList.remove("hidden");
  document.getElementById("bench-stop").classList.add("hidden");
  document.getElementById("bench-phase").classList.add("hidden");
}

// ── Summary ──
function computeSummary(metrics, cfg) {
  const ok = metrics.filter(m=>m.success);
  const ttfts = ok.map(m=>m.ttft).sort((a,b)=>a-b);
  const totals = ok.map(m=>m.total).sort((a,b)=>a-b);
  function p(a,q){return a.length>0?a[Math.floor(a.length*q)].toFixed(0):"0";}
  function avg(a){return a.length>0?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(0):"0";}
  return { total:metrics.length, success:ok.length, failed:metrics.length-ok.length,
    stats:{ ttft:{p50:p(ttfts,.5),p90:p(ttfts,.9),p95:p(ttfts,.95),p99:p(ttfts,.99),avg:avg(ttfts)},
            total:{p50:p(totals,.5),p90:p(totals,.9),p95:p(totals,.95),p99:p(totals,.99),avg:avg(totals)} },
    timestamp:new Date().toISOString() };
}

// ── Log ──
function addLog(msg) {
  logLines.push(msg);
  const el = document.getElementById("log-lines");
  if (!el) return;
  const div = document.createElement("div");
  div.textContent = msg;
  div.className = "leading-relaxed";
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

// ── History ──
async function loadHistory() {
  const section = document.getElementById("history-section");
  if (!section) return;
  section.innerHTML = "";
  try {
    const dirs = await window.__TAURI__.invoke("list_dir", { path: wsPath+"/jobs" });
    const jobs = [];
    for (const d of (dirs||[])) {
      try { const s = await readJSON(wsPath+"/jobs/"+d+"/summary.json"); if(s) jobs.push({dir:d,...s}); } catch(_){}
    }
    jobs.sort((a,b)=>b.dir.localeCompare(a.dir));
    if (jobs.length===0) return;
    section.innerHTML = `<div class="${C.card}"><div class="${C.label} font-semibold mb-1">历史报告</div><div class="space-y-0.5">${
      jobs.slice(0,5).map(j=>`<div class="flex gap-3 text-xs py-0.5">
        <span class="font-mono text-gray-400 w-28">${j.dir}</span>
        <span>${j.success}/${j.total}成功</span>
        <span>TTFT p50:${j.stats.ttft.p50}ms</span>
        <span>p99:${j.stats.ttft.p99}ms</span>
        <span>Avg:${j.stats.ttft.avg}ms</span></div>`).join("")
    }</div></div>`;
  } catch(_) {}
}

init();
