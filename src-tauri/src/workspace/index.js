// ── Tauri bridge (falls back to mock in browser dev) ─────────────
let invoke;

try {
  const tauri = await import("/tauri/core.js");
  invoke = tauri.invoke;
} catch {
  invoke = async (_cmd, _args) => {
    console.warn("[mock] Tauri invoke not available, running in browser");
    return null;
  };
}

// ── Workspace ────────────────────────────────────────────────────
const WORKSPACE_KEY = "bench-tool-workspace-path";

export async function getWorkspacePath() {
  return localStorage.getItem(WORKSPACE_KEY) || "bench-workspace";
}

export async function setWorkspacePath(path) {
  localStorage.setItem(WORKSPACE_KEY, path);
}

export async function initWorkspace(path) {
  return await invoke("init_workspace", { path });
}

export async function checkWorkspace(path) {
  return await invoke("check_workspace", { path });
}

// ── File I/O ─────────────────────────────────────────────────────
export async function readJSON(filePath) {
  try {
    const raw = await invoke("read_workspace_file", { path: filePath });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeJSON(filePath, data) {
  await invoke("write_workspace_file", {
    path: filePath,
    content: JSON.stringify(data, null, 2),
  });
}

export async function listDir(dirPath) {
  try {
    return await invoke("list_dir", { path: dirPath });
  } catch {
    return [];
  }
}

// ── Job helpers ──────────────────────────────────────────────────
export function jobId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

export { invoke };
