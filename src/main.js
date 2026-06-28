import { getWorkspacePath, checkWorkspace, initWorkspace, setWorkspacePath } from "./workspace/index.js";
import { route, start, navigate, currentRoute } from "./ui/router.js";
import { renderServers } from "./ui/servers.js";
import { renderDatasets } from "./ui/datasets.js";
import { renderBenchmark } from "./ui/benchmark.js";
import { renderReports } from "./ui/reports.js";
import { renderSettings } from "./ui/settings.js";

export let app;

async function main() {
  app = document.getElementById("app");
  let wsPath = await getWorkspacePath();
  let info = await checkWorkspace(wsPath);
  if (!info || !info.initialized) {
    await initWorkspace(wsPath);
    await setWorkspacePath(wsPath);
  }
  mountApp(wsPath);
}

function mountApp(wsPath) {
  app.innerHTML = `
    <div class="flex flex-col h-screen">
      <header class="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-6">
          <h1 class="text-lg font-bold text-blue-400">⚡ Bench Tool</h1>
          <nav class="flex gap-1" id="nav"></nav>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-500" id="ws-label"></span>
          <button id="btn-settings" class="text-gray-400 hover:text-gray-200 text-sm">⚙</button>
        </div>
      </header>
      <main id="content" class="flex-1 overflow-auto p-6"></main>
      <footer class="bg-gray-900 border-t border-gray-800 px-6 py-1.5 text-xs text-gray-500 flex justify-between">
        <span id="status-text">就绪</span>
        <span id="ws-path-display"></span>
      </footer>
    </div>`;

  document.getElementById("ws-path-display").textContent = wsPath;

  const nav = document.getElementById("nav");
  const tabs = [
    ["/servers", "服务"],
    ["/datasets", "数据集"],
    ["/benchmark", "压测"],
    ["/reports", "报告"],
  ];
  nav.innerHTML = tabs.map(([p, label]) =>
    `<button data-route="${p}" class="px-3 py-1.5 rounded text-sm transition-colors
      ${currentRoute() === p ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}">
      ${label}</button>`
  ).join("");

  nav.querySelectorAll("button[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-route");
      navigate(r);
      updateNav(r);
    });
  });

  document.getElementById("btn-settings").addEventListener("click", () => navigate("/settings"));

  const content = document.getElementById("content");
  route("/servers", () => { updateNav("/servers"); renderServers(content, wsPath); });
  route("/datasets", () => { updateNav("/datasets"); renderDatasets(content, wsPath); });
  route("/benchmark", () => { updateNav("/benchmark"); renderBenchmark(content, wsPath); });
  route("/reports", () => { updateNav("/reports"); renderReports(content, wsPath); });
  route("/settings", () => { renderSettings(content, wsPath); });

  start();
}

function updateNav(current) {
  document.querySelectorAll("#nav button[data-route]").forEach((btn) => {
    const r = btn.getAttribute("data-route");
    btn.className = r === current
      ? "px-3 py-1.5 rounded text-sm transition-colors bg-blue-600 text-white"
      : "px-3 py-1.5 rounded text-sm transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-800";
  });
}

main();
