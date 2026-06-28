# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
# Dev mode (frontend served from localhost:1420, Tauri webview connects to it)
cargo run --manifest-path src-tauri/Cargo.toml

# Release build (bundled frontend from disk)
cargo build --release --manifest-path src-tauri/Cargo.toml

# CI builds only the binary (no bundler)
cargo build --release --manifest-path src-tauri/Cargo.toml
```

There is no npm/Node.js toolchain — the frontend is vanilla JS modules loaded directly by the Tauri webview or a browser. For browser-only development, serve the repo root with any static file server and the app will operate with mock Tauri IPC (all backend calls return `null`).

## Architecture

**Tauri 2 desktop app** (Rust backend + vanilla JS frontend) for benchmarking LLM inference servers via OpenAI-compatible `/chat/completions` endpoints.

### Frontend (`src/`)

- **`main.js`** — Entry point. Initializes workspace (a filesystem directory managed by the Tauri backend), mounts the app shell (header nav, tab routing, footer), and wires hash-based routing to four pages.
- **`ui/router.js`** — Minimal hash-based SPA router. Routes are registered with `route(path, handler)`, navigation uses `window.location.hash`. No history API, no framework.
- **`ui/servers.js`** — CRUD UI for inference server configurations (name, URL, model, API key). Stored as a JSON array in `<workspace>/servers.json`. Includes a "test connection" button that pings the `/chat/completions` endpoint.
- **`ui/datasets.js`** — CRUD UI for dataset templates. Each dataset defines: token length distribution (uniform/gaussian/zipf), input/output token ranges, and request count. Stored in `<workspace>/datasets.json`.
- **`ui/benchmark.js`** — The main benchmark page. Selects a server + dataset, configures concurrency/prefill/rate/warmup params, starts the `BenchmarkEngine`, and renders a real-time dashboard (throughput, tokens/s, TTFT, success rate, latency percentiles). On completion, writes results to `<workspace>/jobs/<jobId>/` as `requests.jsonl`, `summary.json`, `config.json`, and `servers.json`.
- **`ui/reports.js`** — Lists historical job directories from `<workspace>/jobs/`, showing key metrics per run. Click to open a detail modal with full latency percentiles and JSON export.
- **`ui/settings.js`** — Workspace path configuration. Can switch or create new workspace directories.

### Backend (`src-tauri/src/main.rs`)

Five Tauri IPC commands exposed to the frontend:
- `init_workspace` — Creates directory structure (`datasets/`, `jobs/`) and a `.bench-tool` marker file.
- `check_workspace` — Returns whether the path exists and has the marker.
- `read_workspace_file` / `write_workspace_file` — Read/write JSON files. Write auto-creates parent directories.
- `list_dir` — Lists directory entry names (used to enumerate job dirs for reports).

The backend is purely a filesystem bridge. No HTTP requests, no benchmarking logic — everything runs in the frontend.

### Benchmark Engine (`src/engine/benchmark.js`)

Core benchmarking logic, all client-side:

- **Concurrency model**: Two-tier limiter — `prefillLimiter` caps how many requests are simultaneously in prefill phase (waiting for first token), `limiter` caps total in-flight requests (decode). A request releases its prefill slot when the first SSE token arrives, but holds the total slot until the stream ends.
- **Rate control**: When `rate > 0`, requests are dispatched at that rate (req/s) with `setTimeout`-based throttling. When `rate = 0`, all requests fire at once (bounded by the concurrency limiters).
- **Warmup**: First N requests run and complete before real requests start; their metrics are discarded.
- **Streaming**: Parses SSE (`data: ...`) lines from the fetch response body. Tracks TTFT (time to first token), output token count (from delta chunks), and total latency.
- **Dataset generation**: Generates synthetic prompts ("A A A ...") with token lengths sampled from uniform, gaussian, or zipf distributions.

### Data Flow

```
[UI] → BenchmarkEngine.start()
     → generatePrompts(dataset)
     → N concurrent fetchStream() calls (rate-limited)
     → SSE parsing, metrics collected
     → onProgress() → live dashboard updates
     → onComplete() → writeJSON(requests.jsonl + summary.json)
     → Reports page reads summary.json for history view
```

All persistence is through the Tauri IPC bridge (`invoke`) → Rust `fs` operations on the workspace directory. The bridge has a browser mock fallback for dev without Tauri (returns `null`, state lives only in memory).

### Workspace Layout

```
<workspace>/
  .bench-tool          # marker file
  config.json          # workspace metadata
  servers.json         # [{ name, url, model, apiKey }]
  datasets.json        # [{ name, distribution, inputMin/Max, outputMin/Max, requestCount }]
  jobs/
    <YYYYMMDD_HHmmss>/
      config.json      # benchmark config snapshot
      servers.json     # server snapshot
      requests.jsonl   # per-request metrics array
      summary.json     # computed summary (throughput, percentiles)
```
