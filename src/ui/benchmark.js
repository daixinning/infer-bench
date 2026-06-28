import { readJSON, writeJSON, jobId } from "../workspace/index.js";
import { BenchmarkEngine } from "../engine/benchmark.js";

let engine = null;

export async function renderBenchmark(container, wsPath) {
  const servers = (await readJSON(wsPath + "/servers.json")) || [];
  const datasets = (await readJSON(wsPath + "/datasets.json")) || [];

  container.innerHTML = `
    <div class="max-w-4xl mx-auto">
      <h2 class="text-xl font-semibold mb-6">压测配置</h2>
      <div class="grid grid-cols-2 gap-6 mb-6">
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 class="text-sm font-medium text-gray-400 mb-3">推理服务</h3>
          ${servers.length === 0
            ? '<p class="text-sm text-gray-500">暂无服务，请先在"服务"页面添加</p>'
            : `<select id="bench-server" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                ${servers.map(s => `<option value="${escH(s.name)}">${escH(s.name)} — ${escH(s.url)}</option>`).join("")}</select>`}
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 class="text-sm font-medium text-gray-400 mb-3">数据集</h3>
          ${datasets.length === 0
            ? '<p class="text-sm text-gray-500">暂无数据集，请先在"数据集"页面创建</p>'
            : `<select id="bench-dataset" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                ${datasets.map(d => `<option value="${escH(d.name)}">${escH(d.name)} (${d.requestCount}条)</option>`).join("")}</select>`}
        </div>
      </div>

      <!-- 并发参数 -->
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <h3 class="text-sm font-medium text-gray-400 mb-3">并发控制</h3>
        <div class="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label class="block text-xs text-gray-500 mb-1">总并发数 <span class="text-gray-600">(Decode 上限)</span></label>
            <input id="bench-concurrency" type="number" value="32" min="1" max="512" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Prefill 并发 <span class="text-gray-600">(计算瓶颈)</span></label>
            <input id="bench-prefill" type="number" value="4" min="1" max="512" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">提交速率 <span class="text-gray-600">(req/s, 0=全发)</span></label>
            <input id="bench-rate" type="number" value="0" min="0" max="1000" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          </div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="block text-xs text-gray-500 mb-1">预热请求数 <span class="text-gray-600">(不计入统计)</span></label>
            <input id="bench-warmup" type="number" value="0" min="0" max="9999" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Max Tokens</label>
            <input id="bench-max-tokens" type="number" value="1024" min="1" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          </div>
          <div></div>
        </div>
      </div>

      <!-- 生成参数 -->
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <h3 class="text-sm font-medium text-gray-400 mb-3">生成参数</h3>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Temperature</label>
            <input id="bench-temp" type="number" value="0.6" min="0" max="2" step="0.1" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Top-P</label>
            <input id="bench-top-p" type="number" value="0.95" min="0" max="1" step="0.01" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          </div>
          <div class="flex items-end pb-2">
            <label class="inline-flex items-center gap-2">
              <input id="bench-stream" type="checkbox" checked class="accent-blue-600">
              <span class="text-sm text-gray-400">流式 (streaming)</span>
            </label>
          </div>
        </div>
      </div>

      <div class="flex gap-3 mb-6">
        <button id="bench-start" class="bg-blue-600 hover:bg-blue-500 px-6 py-2.5 rounded text-sm font-medium">▶ 开始压测</button>
        <button id="bench-stop" class="bg-red-600 hover:bg-red-500 px-6 py-2.5 rounded text-sm font-medium hidden">⏹ 停止</button>
        <span id="bench-phase" class="self-center text-sm text-yellow-400 hidden"></span>
      </div>

      <!-- Dashboard -->
      <div id="bench-dashboard" class="hidden space-y-4">
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-gray-400">进度</span>
            <span id="bench-progress-text" class="text-sm text-blue-400">0 / 0</span>
          </div>
          <div class="w-full bg-gray-800 rounded-full h-2">
            <div id="bench-progress-bar" class="bg-blue-500 rounded-full h-2 transition-all" style="width:0%"></div>
          </div>
        </div>
        <div class="grid grid-cols-5 gap-4">
          <div class="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <p class="text-xs text-gray-500 mb-1">吞吐量</p>
            <p id="metric-throughput" class="text-xl font-mono text-blue-400">--</p>
            <p class="text-xs text-gray-600">req/s</p></div>
          <div class="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <p class="text-xs text-gray-500 mb-1">Tokens/s</p>
            <p id="metric-tokens" class="text-xl font-mono text-green-400">--</p>
            <p class="text-xs text-gray-600">tokens</p></div>
          <div class="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <p class="text-xs text-gray-500 mb-1">TTFT 平均</p>
            <p id="metric-ttft" class="text-xl font-mono text-yellow-400">--</p>
            <p class="text-xs text-gray-600">ms</p></div>
          <div class="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <p class="text-xs text-gray-500 mb-1">Prefill 中</p>
            <p id="metric-prefill" class="text-xl font-mono text-orange-400">--</p>
            <p class="text-xs text-gray-600">个</p></div>
          <div class="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <p class="text-xs text-gray-500 mb-1">成功率</p>
            <p id="metric-success" class="text-xl font-mono text-purple-400">--</p>
            <p class="text-xs text-gray-600">%</p></div>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 class="text-sm font-medium text-gray-400 mb-3">延迟分位数 (ms)</h3>
          <table class="w-full text-sm"><thead><tr class="text-gray-500 text-left"><th class="pb-2">指标</th><th class="pb-2">P50</th><th class="pb-2">P90</th><th class="pb-2">P95</th><th class="pb-2">P99</th><th class="pb-2">Avg</th></tr></thead>
            <tbody id="latency-table" class="font-mono text-gray-300"><tr><td colspan="6" class="text-gray-600 py-4 text-center">等待数据...</td></tr></tbody></table>
        </div>
      </div>
    </div>`;

  if (servers.length > 0 && datasets.length > 0) {
    document.getElementById("bench-start").onclick = () => startBenchmark(wsPath, servers, datasets);
  }
  document.getElementById("bench-stop").onclick = () => { if (engine) engine.stop(); onStopped(); };
}

// ---- Start ----
function startBenchmark(wsPath, servers, datasets) {
  const sName = document.getElementById("bench-server").value;
  const dName = document.getElementById("bench-dataset").value;
  const server = servers.find(s => s.name === sName);
  const dataset = datasets.find(d => d.name === dName);
  const config = {
    server, dataset,
    concurrency: parseInt(document.getElementById("bench-concurrency").value),
    prefillConcurrency: parseInt(document.getElementById("bench-prefill").value),
    rate: parseInt(document.getElementById("bench-rate").value),
    warmup: parseInt(document.getElementById("bench-warmup").value),
    stream: document.getElementById("bench-stream").checked,
    maxTokens: parseInt(document.getElementById("bench-max-tokens").value),
    temperature: parseFloat(document.getElementById("bench-temp").value),
    topP: parseFloat(document.getElementById("bench-top-p").value),
  };

  document.getElementById("bench-start").classList.add("hidden");
  document.getElementById("bench-stop").classList.remove("hidden");
  document.getElementById("bench-dashboard").classList.remove("hidden");

  const jobDir = wsPath + "/jobs/" + jobId();
  writeJSON(jobDir + "/servers.json", server);
  writeJSON(jobDir + "/config.json", config);

  engine = new BenchmarkEngine(config);
  let allMetrics = [];

  engine.onProgress((p) => {
    updateDashboard(p);
    allMetrics.push(...p.completed);
  });

  engine.onComplete(async () => {
    await writeJSON(jobDir + "/requests.jsonl", allMetrics);
    const summary = computeSummary(allMetrics, config);
    await writeJSON(jobDir + "/summary.json", summary);
    showSummary(summary);
    onStopped();
  });

  engine.onError((err) => {
    document.getElementById("bench-progress-text").textContent = "错误: " + err;
    onStopped();
  });

  engine.start();
}

function updateDashboard(p) {
  const phaseEl = document.getElementById("bench-phase");
  if (p.phase === "warmup") {
    phaseEl.classList.remove("hidden");
    phaseEl.textContent = `预热中... ${p.warmupDone}/${p.warmupTotal}`;
    document.getElementById("bench-progress-text").textContent = `预热 ${p.warmupDone}/${p.warmupTotal}`;
    document.getElementById("bench-progress-bar").style.width = (p.warmupTotal > 0 ? p.warmupDone / p.warmupTotal * 100 : 0) + "%";
  } else {
    phaseEl.classList.add("hidden");
    const done = p.done + p.failed;
    const pct = p.total > 0 ? (done / p.total * 100).toFixed(0) : "0";
    document.getElementById("bench-progress-text").textContent = done + " / " + p.total;
    document.getElementById("bench-progress-bar").style.width = pct + "%";
  }

  if (p.completed.length > 0) {
    const ms = p.completed;
    const elapsed = (Date.now() - p.startTime) / 1000;
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
    // Prefill count is tracked by engine internally — show metric from total - completed
    document.getElementById("metric-prefill").textContent = "--";
  }
}

function showSummary(s) {
  const tbody = document.getElementById("latency-table");
  const st = s.stats;
  tbody.innerHTML = `<tr><td>TTFT</td><td>${st.ttft.p50}</td><td>${st.ttft.p90}</td><td>${st.ttft.p95}</td><td>${st.ttft.p99}</td><td>${st.ttft.avg}</td></tr>
    <tr><td>Total</td><td>${st.total.p50}</td><td>${st.total.p90}</td><td>${st.total.p95}</td><td>${st.total.p99}</td><td>${st.total.avg}</td></tr>
    ${st.tpot ? `<tr class="text-gray-500"><td>TPOT</td><td>${st.tpot.p50}</td><td>${st.tpot.p90}</td><td>${st.tpot.p95}</td><td>${st.tpot.p99}</td><td>${st.tpot.avg}</td></tr>` : ""}`;
}

function onStopped() {
  document.getElementById("bench-start").classList.remove("hidden");
  document.getElementById("bench-stop").classList.add("hidden");
  document.getElementById("bench-phase").classList.add("hidden");
}

function computeSummary(metrics, config) {
  const success = metrics.filter(m => m.success);
  const ttfts = success.map(m => m.ttft).sort((a, b) => a - b);
  const totals = success.map(m => m.total).sort((a, b) => a - b);
  const tpots = success.filter(m => m.tpot > 0).map(m => m.tpot).sort((a, b) => a - b);
  function p(arr, q) { return arr.length > 0 ? arr[Math.floor(arr.length * q)].toFixed(0) : "0"; }
  function avg(arr) { return arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(0) : "0"; }
  return {
    concurrency: config.concurrency,
    prefillConcurrency: config.prefillConcurrency,
    rate: config.rate,
    warmup: config.warmup,
    total: metrics.length, success: success.length, failed: metrics.length - success.length,
    throughput: success.length > 0 ? (success.length / ((totals[totals.length - 1] - metrics[0].startTime) / 1000)).toFixed(1) : 0,
    stats: {
      ttft: { p50: p(ttfts, 0.5), p90: p(ttfts, 0.9), p95: p(ttfts, 0.95), p99: p(ttfts, 0.99), avg: avg(ttfts) },
      total: { p50: p(totals, 0.5), p90: p(totals, 0.9), p95: p(totals, 0.95), p99: p(totals, 0.99), avg: avg(totals) },
      tpot: tpots.length > 0 ? { p50: p(tpots, 0.5), p90: p(tpots, 0.9), p95: p(tpots, 0.95), p99: p(tpots, 0.99), avg: avg(tpots) } : null,
    },
    timestamp: new Date().toISOString(),
  };
}

function escH(s) { return (s||"").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
