// ── Simple hash-based router ──────────────────────────────────────
const routes = new Map();

export function route(path, handler) {
  routes.set(path, handler);
}

export function navigate(path) {
  window.location.hash = path;
}

export function start() {
  const render = () => {
    const hash = window.location.hash.replace("#", "") || "/servers";
    const handler = routes.get(hash);
    if (handler) {
      handler();
    } else {
      navigate("/servers");
    }
  };
  window.addEventListener("hashchange", render);
  render();
}

export function currentRoute() {
  return window.location.hash.replace("#", "") || "/servers";
}
