import { getWorkspacePath, setWorkspacePath, checkWorkspace, initWorkspace } from "../workspace/index.js";
import { navigate } from "./router.js";

export async function renderSettings(container, wsPath) {
  container.innerHTML = `
    <div class="max-w-lg mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-semibold">设置</h2>
        <button id="back-btn" class="text-blue-400 hover:text-blue-300 text-sm">← 返回</button>
      </div>
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-6">
        <div>
          <h3 class="text-sm font-medium text-gray-400 mb-2">工作区目录</h3>
          <div class="flex gap-2">
            <input id="settings-ws-path" type="text" value="${escH(wsPath)}" class="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
            <button id="settings-change" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm">更改</button>
          </div>
          <p id="settings-msg" class="text-xs mt-2 hidden"></p>
        </div>
        <div class="border-t border-gray-800 pt-4">
          <h3 class="text-sm font-medium text-gray-400 mb-2">关于</h3>
          <p class="text-sm text-gray-500">Bench Tool v0.1.0</p>
          <p class="text-sm text-gray-600 mt-1">LLM 推理性能压测工具 · Tauri + HTML/CSS/JS</p>
        </div>
      </div>
    </div>`;

  document.getElementById("back-btn").onclick = () => navigate("/servers");
  document.getElementById("settings-change").onclick = async () => {
    const inp = document.getElementById("settings-ws-path");
    const msg = document.getElementById("settings-msg");
    const np = inp.value.trim();
    if (!np) { msg.textContent = "路径不能为空"; msg.className = "text-xs mt-2 text-red-400"; return; }
    const info = await checkWorkspace(np);
    if (!info || !info.initialized) { await initWorkspace(np); msg.textContent = "已创建新工作区"; }
    else { msg.textContent = "工作区已更改"; }
    msg.className = "text-xs mt-2 text-green-400";
    await setWorkspacePath(np);
  };
}

function escH(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
