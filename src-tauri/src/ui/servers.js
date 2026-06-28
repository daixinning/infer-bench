import { readJSON, writeJSON } from "../workspace/index.js";

export async function renderServers(container, wsPath) {
  const servers = (await readJSON(wsPath + "/servers.json")) || [];

  container.innerHTML = `
    <div class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-semibold">推理服务</h2>
        <button id="add-server" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm">+ 添加服务</button>
      </div>
      <div id="server-list" class="space-y-3">
        ${servers.length === 0
          ? '<div class="text-gray-500 text-center py-12">暂无服务，点击上方按钮添加</div>'
          : servers.map((s, i) => `
            <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
              <div>
                <h3 class="font-medium">${escH(s.name)}</h3>
                <p class="text-sm text-gray-400 mt-1">${escH(s.url)} — ${escH(s.model || "auto")}</p>
                ${s.apiKey ? '<span class="text-xs text-green-500">API Key ✓</span>' : ""}
              </div>
              <div class="flex gap-2">
                <button data-test="${i}" class="text-blue-400 hover:text-blue-300 text-sm">测试连接</button>
                <button data-del="${i}" class="text-red-400 hover:text-red-300 text-sm">删除</button>
              </div>
            </div>`).join("")}
      </div>
      <div id="add-modal" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="bg-gray-900 rounded-xl p-6 w-[480px] border border-gray-800">
          <h3 class="text-lg font-semibold mb-4">添加推理服务</h3>
          <form id="server-form" class="space-y-3">
            <div>
              <label class="block text-sm text-gray-400 mb-1">名称</label>
              <input name="name" required class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="生产环境 vLLM">
            </div><div>
              <label class="block text-sm text-gray-400 mb-1">API 地址</label>
              <input name="url" required class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="http://10.0.0.5:8000/v1">
            </div><div>
              <label class="block text-sm text-gray-400 mb-1">模型名称 <span class="text-gray-600">(可选)</span></label>
              <input name="model" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="auto-detect">
            </div><div>
              <label class="block text-sm text-gray-400 mb-1">API Key <span class="text-gray-600">(可选)</span></label>
              <input name="apiKey" type="password" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="sk-...">
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" id="cancel-add" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm">取消</button>
              <button type="submit" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm">保存</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;

  document.getElementById("add-server").onclick = () => {
    document.getElementById("add-modal").classList.remove("hidden");
  };
  document.getElementById("cancel-add").onclick = () => {
    document.getElementById("add-modal").classList.add("hidden");
  };
  document.getElementById("server-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    servers.push({
      name: fd.get("name"),
      url: fd.get("url"),
      model: fd.get("model"),
      apiKey: fd.get("apiKey"),
    });
    await writeJSON(wsPath + "/servers.json", servers);
    renderServers(container, wsPath);
  };

  container.querySelectorAll("[data-test]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const i = parseInt(btn.getAttribute("data-test"));
      const s = servers[i];
      btn.textContent = "测试中...";
      try {
        const headers = { "Content-Type": "application/json" };
        if (s.apiKey) headers["Authorization"] = "Bearer " + s.apiKey;
        const resp = await fetch(s.url + "/chat/completions", {
          method: "POST", headers,
          body: JSON.stringify({ model: s.model || "", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
        });
        btn.textContent = resp.ok ? "✓ 连接成功" : "✗ " + resp.status;
        btn.className = resp.ok ? "text-green-400 text-sm" : "text-yellow-400 text-sm";
      } catch (e) {
        btn.textContent = "✗ " + e.message;
        btn.className = "text-red-400 text-sm";
      }
    });
  });

  container.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const i = parseInt(btn.getAttribute("data-del"));
      servers.splice(i, 1);
      await writeJSON(wsPath + "/servers.json", servers);
      renderServers(container, wsPath);
    });
  });
}

function escH(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
