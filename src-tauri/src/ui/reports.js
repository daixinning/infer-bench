import { listDir, readJSON } from "../workspace/index.js";

export async function renderReports(container, wsPath) {
  const jobDirs = (await listDir(wsPath + "/jobs")).sort().reverse();
  const jobs = [];
  for (const dir of jobDirs) {
    const summary = await readJSON(wsPath + "/jobs/" + dir + "/summary.json");
    jobs.push({ id: dir, summary });
  }

  container.innerHTML = `
    <div class="max-w-4xl mx-auto">
      <h2 class="text-xl font-semibold mb-6">测试报告</h2>
      ${jobs.length === 0
        ? '<div class="text-gray-500 text-center py-12">暂无测试记录</div>'
        : jobs.map(j => {
            const s = j.summary;
            if (!s) return `<div class="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-3"><span class="text-gray-500 text-sm">${j.id} — 数据不完整</span></div>`;
            return `<div class="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-3 cursor-pointer hover:border-blue-600 transition-colors" data-job="${j.id}">
              <div class="flex items-center justify-between">
                <div><h3 class="font-medium">${j.id}</h3>
                  <p class="text-xs text-gray-500 mt-1">${s.success}/${s.total} 成功 · 并发:${s.concurrency} · ${s.timestamp||""}</p></div>
                <div class="text-right"><span class="text-lg font-mono text-blue-400">${s.throughput}</span><span class="text-xs text-gray-500 ml-1">req/s</span></div>
              </div>
              <div class="grid grid-cols-4 gap-4 mt-3 pt-3 border-t border-gray-800">
                <div><span class="text-xs text-gray-500">TTFT Avg</span><p class="text-sm font-mono text-yellow-400">${s.stats.ttft.avg} ms</p></div>
                <div><span class="text-xs text-gray-500">Total Avg</span><p class="text-sm font-mono text-gray-300">${s.stats.total.avg} ms</p></div>
                <div><span class="text-xs text-gray-500">P99 Total</span><p class="text-sm font-mono text-red-400">${s.stats.total.p99} ms</p></div>
                <div><span class="text-xs text-gray-500">失败</span><p class="text-sm font-mono ${s.failed>0?'text-red-400':'text-green-400'}">${s.failed}</p></div>
              </div></div>`;
          }).join("")}
      <div id="report-detail" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="bg-gray-900 rounded-xl p-6 w-[720px] max-h-[80vh] overflow-auto border border-gray-800">
          <div class="flex items-center justify-between mb-4"><h3 class="text-lg font-semibold" id="detail-title"></h3><button id="close-detail" class="text-gray-400 hover:text-gray-200 text-lg">&times;</button></div>
          <div id="detail-content"></div></div></div>
    </div>`;

  container.querySelectorAll("[data-job]").forEach((el) => {
    el.addEventListener("click", async () => {
      const jid = el.getAttribute("data-job");
      const summary = await readJSON(wsPath + "/jobs/" + jid + "/summary.json");
      const config = await readJSON(wsPath + "/jobs/" + jid + "/config.json");
      const server = await readJSON(wsPath + "/jobs/" + jid + "/servers.json");
      document.getElementById("detail-title").textContent = jid;
      document.getElementById("detail-content").innerHTML = `
        <div class="space-y-4">
          <div class="bg-gray-800 rounded p-3 text-sm"><span class="text-gray-400">目标服务:</span> ${escH(server?.name||"?")} (${escH(server?.url||"?")})
            ${config?` · 并发:${config.concurrency} · stream:${config.stream?"on":"off"}`:""}</div>
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-gray-800 rounded p-3"><h4 class="text-xs text-gray-500 mb-2">吞吐</h4><p class="text-xl font-mono text-blue-400">${summary.throughput} req/s</p></div>
            <div class="bg-gray-800 rounded p-3"><h4 class="text-xs text-gray-500 mb-2">成功率</h4><p class="text-xl font-mono text-green-400">${(summary.success/summary.total*100).toFixed(1)}%</p></div></div>
          <table class="w-full text-sm"><thead><tr class="text-gray-500 text-left"><th class="pb-2">指标</th><th class="pb-2">P50</th><th class="pb-2">P90</th><th class="pb-2">P95</th><th class="pb-2">P99</th><th class="pb-2">Avg</th></tr></thead>
            <tbody class="font-mono text-gray-300">
              <tr><td class="py-1">TTFT(ms)</td><td>${summary.stats.ttft.p50}</td><td>${summary.stats.ttft.p90}</td><td>${summary.stats.ttft.p95}</td><td>${summary.stats.ttft.p99}</td><td>${summary.stats.ttft.avg}</td></tr>
              <tr><td class="py-1">Total(ms)</td><td>${summary.stats.total.p50}</td><td>${summary.stats.total.p90}</td><td>${summary.stats.total.p95}</td><td>${summary.stats.total.p99}</td><td>${summary.stats.total.avg}</td></tr></tbody></table>
          <button id="export-btn" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm">导出 JSON</button></div>`;
      document.getElementById("report-detail").classList.remove("hidden");
      document.getElementById("export-btn").onclick = async () => {
        const requests = await readJSON(wsPath + "/jobs/" + jid + "/requests.jsonl");
        const blob = new Blob([JSON.stringify({summary,config,server,requests},null,2)],{type:"application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href=url; a.download=jid+".json"; a.click();
        URL.revokeObjectURL(url);
      };
    });
  });
  document.getElementById("close-detail").onclick = () => document.getElementById("report-detail").classList.add("hidden");
}

function escH(s) { return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
