// ── Dataset generator ─────────────────────────────────────────────
function generatePrompts(dataset) {
  const prompts = [];
  for (let i = 0; i < dataset.requestCount; i++) {
    const len = sampleLength(dataset.inputMin, dataset.inputMax, dataset.distribution);
    prompts.push("A ".repeat(len).trim());
  }
  return prompts;
}

function sampleLength(min, max, dist) {
  if (dist === "uniform") {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  } else if (dist === "gaussian") {
    const mean = (min + max) / 2;
    const std = (max - min) / 4;
    let val = mean + std * (Math.random() + Math.random() + Math.random() - 1.5) * 2;
    return Math.max(min, Math.min(max, Math.round(val)));
  } else {
    const n = max - min + 1;
    const rank = Math.floor(Math.pow(Math.random(), -2) * n) % n;
    return Math.max(min, Math.min(max, min + rank));
  }
}

// ── Concurrency limiter ───────────────────────────────────────────
class ConcurrencyLimiter {
  constructor(max) { this.max = max; this.running = 0; this.waitQueue = []; }

  async acquire() {
    while (this.running >= this.max) {
      await new Promise(r => this.waitQueue.push(r));
    }
    this.running++;
  }

  release() {
    this.running--;
    const next = this.waitQueue.shift();
    if (next) next();
  }
}

// ── Stream client ─────────────────────────────────────────────────
// Returns { metrics, prefillDone } — prefillDone resolves when first token arrives
async function fetchStream(config, prompt, id) {
  const startTime = performance.now();
  const m = { id, startTime, ttft: 0, tpot: 0, total: 0, inputTokens: 0, outputTokens: 0, success: false };
  let prefillResolve = null;
  const prefillDone = new Promise(r => { prefillResolve = r; });

  try {
    const headers = { "Content-Type": "application/json" };
    if (config.server.apiKey) headers["Authorization"] = "Bearer " + config.server.apiKey;

    const body = {
      model: config.server.model || "",
      messages: [{ role: "user", content: prompt }],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      top_p: config.topP,
      stream: config.stream,
    };

    if (!config.stream) {
      const resp = await fetch(config.server.url + "/chat/completions", { method: "POST", headers, body: JSON.stringify(body) });
      prefillResolve(); // non-stream: prefill = entire request
      if (!resp.ok) { m.error = "HTTP " + resp.status; return { metrics: m, prefillDone }; }
      const data = await resp.json();
      m.success = true;
      m.total = performance.now() - startTime;
      m.ttft = m.total;
      m.inputTokens = data.usage?.prompt_tokens || 0;
      m.outputTokens = data.usage?.completion_tokens || 0;
      m.tpot = m.outputTokens > 0 ? (m.total - m.ttft) / m.outputTokens : 0;
      return { metrics: m, prefillDone };
    }

    body.stream = true;
    const resp = await fetch(config.server.url + "/chat/completions", { method: "POST", headers, body: JSON.stringify(body) });
    if (!resp.ok) { prefillResolve(); m.error = "HTTP " + resp.status; return { metrics: m, prefillDone }; }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", firstToken = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const t = line.trim();
        if (!t || !t.startsWith("data:")) continue;
        const d = t.slice(5).trim();
        if (d === "[DONE]") break;
        try {
          const json = JSON.parse(d);
          const now = performance.now();
          if (firstToken) {
            m.ttft = now - startTime;
            firstToken = false;
            prefillResolve(); // ← Prefill phase done
          }
          if (json.usage) { m.inputTokens = json.usage.prompt_tokens || 0; m.outputTokens = json.usage.completion_tokens || 0; }
          if (json.choices?.[0]?.delta?.content) m.outputTokens++;
        } catch {}
      }
    }

    if (firstToken) prefillResolve(); // no tokens arrived
    m.success = true;
    m.total = performance.now() - startTime;
    if (m.outputTokens > 1) m.tpot = (m.total - m.ttft) / (m.outputTokens - 1);
    return { metrics: m, prefillDone };
  } catch (e) {
    if (prefillResolve) prefillResolve();
    m.error = e.message || "Unknown error";
    return { metrics: m, prefillDone };
  }
}

// ── Sleep helper ──────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Benchmark engine ──────────────────────────────────────────────
export class BenchmarkEngine {
  constructor(config) {
    this.config = config;
    // Total concurrency = max in-flight requests (decode + prefill)
    this.limiter = new ConcurrencyLimiter(config.concurrency);
    // Prefill-only concurrency = max requests in prefill phase
    const prefillMax = config.prefillConcurrency || config.concurrency;
    this.prefillLimiter = new ConcurrencyLimiter(prefillMax);
    // Submission rate (req/s). 0 = no throttle.
    this.rate = config.rate || 0;
    // Warmup: first N requests discarded from stats
    this.warmup = config.warmup || 0;

    this.abort = false;
    this.progressCb = () => {};
    this.completeCb = () => {};
    this.errorCb = () => {};
    this.logCb = () => {};
    this.total = 0; this.done = 0; this.failed = 0;
    this.completed = []; this.startTime = 0;
    this.warmupDone = 0;
  }

  onProgress(cb) { this.progressCb = cb; }
  onComplete(cb) { this.completeCb = cb; }
  onError(cb) { this.errorCb = cb; }
  onLog(cb) { this.logCb = cb; }
  stop() { this.abort = true; }

  async start() {
    this.abort = false;
    this.startTime = Date.now();
    const allPrompts = generatePrompts(this.config.dataset);

    // Split warmup vs real
    const warmupPrompts = allPrompts.slice(0, this.warmup);
    const realPrompts = allPrompts.slice(this.warmup);
    this.total = realPrompts.length;
    this.done = 0; this.failed = 0; this.completed = [];
    this.warmupDone = 0;

    this.progressCb({
      total: this.total, done: 0, failed: 0,
      completed: [], startTime: this.startTime,
      phase: this.warmup > 0 ? "warmup" : "running",
      warmupTotal: this.warmup, warmupDone: 0,
    });

    // Run warmup (discarded)
    if (this.warmup > 0) {
      const warmupTasks = warmupPrompts.map((p, i) =>
        this.runOne(p, -(i + 1), true)
      );
      await Promise.all(warmupTasks);
      this.warmupDone = this.warmup;
      this.progressCb({
        total: this.total, done: 0, failed: 0,
        completed: [], startTime: this.startTime,
        phase: "running",
        warmupTotal: this.warmup, warmupDone: this.warmup,
      });
    }

    // Run real benchmark with rate control
    if (this.rate > 0) {
      // Rate-limited dispatch
      const interval = 1000 / this.rate;
      const tasks = [];
      for (let i = 0; i < realPrompts.length; i++) {
        if (this.abort) break;
        tasks.push(this.runOne(realPrompts[i], i, false));
        if (i < realPrompts.length - 1) {
          await sleep(interval);
        }
      }
      try { await Promise.all(tasks); } catch (e) { this.errorCb(e.message); return; }
    } else {
      // Fire all at once (old behavior), limited by both limiters
      const tasks = realPrompts.map((p, i) => this.runOne(p, i, false));
      try { await Promise.all(tasks); } catch (e) { this.errorCb(e.message); return; }
    }

    if (!this.abort) this.completeCb();
  }

  async runOne(prompt, id, isWarmup) {
    if (this.abort) return;

    const rid = isWarmup ? `warmup#${-id}` : `#${id+1}`;
    if (!isWarmup) this.logCb({ type: "start", id: rid, time: Date.now() });

    // Acquire prefill slot first (controls how many requests are in prefill simultaneously)
    await this.prefillLimiter.acquire();
    if (this.abort) { this.prefillLimiter.release(); return; }

    // Acquire total concurrency slot
    await this.limiter.acquire();
    if (this.abort) { this.limiter.release(); this.prefillLimiter.release(); return; }

    try {
      const { metrics, prefillDone } = await fetchStream(this.config, prompt, id);

      // When first token arrives, prefill is done → release prefill slot
      // But keep total concurrency slot until decode finishes
      prefillDone.then(() => {
        this.prefillLimiter.release();
      });

      if (!isWarmup) {
        if (metrics.success) this.done++; else this.failed++;
        this.completed.push(metrics);
        this.logCb({
          type: metrics.success ? "ok" : "fail",
          id: rid, ttft: metrics.ttft.toFixed(0),
          outputTokens: metrics.outputTokens, total: metrics.total.toFixed(0),
          error: metrics.error, time: Date.now(),
        });
        this.progressCb({
          total: this.total, done: this.done, failed: this.failed,
          completed: [metrics], startTime: this.startTime,
          phase: "running",
          warmupTotal: this.warmup, warmupDone: this.warmupDone,
        });
      }
    } finally {
      // Release total concurrency slot (decode done)
      this.limiter.release();
    }
  }
}
