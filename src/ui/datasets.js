import { readJSON, writeJSON } from "../workspace/index.js";

export async function renderDatasets(container, wsPath) {
  const datasets = (await readJSON(wsPath + "/datasets.json")) || [];

  container.innerHTML = `
    <div class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-semibold">数据集模板</h2>
        <button id="add-dataset" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm">+ 新建数据集</button>
      </div>
      <div id="dataset-list" class="space-y-3">
        ${datasets.length === 0
          ? '<div class="text-gray-500 text-center py-12">暂无数据集模板，点击上方按钮创建</div>'
          : datasets.map((d, i) => `
            <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
              <div>
                <h3 class="font-medium">${escH(d.name)}</h3>
                <p class="text-sm text-gray-400 mt-1">${d.distribution} | in: ${d.inputMin}-${d.inputMax} | out: ${d.outputMin}-${d.outputMax} | ${d.requestCount}条</p>
              </div>
              <div class="flex gap-2">
                <button data-del="${i}" class="text-red-400 hover:text-red-300 text-sm">删除</button>
              </div>
            </div>`).join("")}
      </div>
      <div id="ds-modal" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="bg-gray-900 rounded-xl p-6 w-[520px] border border-gray-800">
          <h3 class="text-lg font-semibold mb-4">新建数据集</h3>
          <form id="ds-form" class="space-y-3">
            <div><label class="block text-sm text-gray-400 mb-1">名称</label>
              <input name="name" required class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="uniform-1024-1024"></div>
            <div><label class="block text-sm text-gray-400 mb-1">分布类型</label>
              <select name="distribution" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                <option value="uniform">uniform (均匀)</option>
                <option value="gaussian">gaussian (正态)</option>
                <option value="zipf">zipf (长尾)</option></select></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs text-gray-400 mb-1">Input 最小 (tokens)</label>
                <input name="inputMin" type="number" value="512" min="1" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"></div>
              <div><label class="block text-xs text-gray-400 mb-1">Input 最大 (tokens)</label>
                <input name="inputMax" type="number" value="1024" min="1" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"></div>
              <div><label class="block text-xs text-gray-400 mb-1">Output 最小 (tokens)</label>
                <input name="outputMin" type="number" value="256" min="1" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"></div>
              <div><label class="block text-xs text-gray-400 mb-1">Output 最大 (tokens)</label>
                <input name="outputMax" type="number" value="1024" min="1" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"></div>
            </div>
            <div><label class="block text-sm text-gray-400 mb-1">请求数量</label>
              <input name="requestCount" type="number" value="100" min="1" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"></div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" id="cancel-ds" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm">取消</button>
              <button type="submit" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm">保存</button></div>
          </form></div></div></div>`;

  document.getElementById("add-dataset").onclick = () => document.getElementById("ds-modal").classList.remove("hidden");
  document.getElementById("cancel-ds").onclick = () => document.getElementById("ds-modal").classList.add("hidden");
  document.getElementById("ds-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    datasets.push({
      name: fd.get("name"),
      distribution: fd.get("distribution"),
      inputMin: parseInt(fd.get("inputMin")),
      inputMax: parseInt(fd.get("inputMax")),
      outputMin: parseInt(fd.get("outputMin")),
      outputMax: parseInt(fd.get("outputMax")),
      requestCount: parseInt(fd.get("requestCount")),
    });
    await writeJSON(wsPath + "/datasets.json", datasets);
    renderDatasets(container, wsPath);
  };

  container.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      datasets.splice(parseInt(btn.getAttribute("data-del")), 1);
      await writeJSON(wsPath + "/datasets.json", datasets);
      renderDatasets(container, wsPath);
    });
  });
}

function escH(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
