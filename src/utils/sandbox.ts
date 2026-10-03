// Isolated execution for code we did not write (model-generated scripts and
// imported guard wrappers).
//
// Each run creates a throwaway <iframe sandbox="allow-scripts"> (opaque origin:
// no access to this page, its storage or cookies) whose CSP blocks all network
// requests, and runs the code inside a Web Worker there so an infinite loop can
// be killed. The iframe is removed after every run or on timeout.

export interface SandboxResult {
  ok: boolean;
  result: any;
  logs: string[];
  error?: string;
  memory?: Record<string, any>;
  timeMs: number;
}

const WORKER_SRC = `
self.onmessage = function (e) {
  var data = e.data, logs = [];
  var log = function () {
    logs.push(Array.prototype.map.call(arguments, function (a) {
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch (_) { return String(a); }
    }).join(' '));
  };
  ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','indexedDB','caches','BroadcastChannel','Worker','SharedWorker']
    .forEach(function (k) { try { self[k] = undefined; } catch (_) {} });
  var con = { log: log, info: log, warn: function () { log.apply(null, ['[WARN]'].concat([].slice.call(arguments))); }, error: function () { log.apply(null, ['[ERR]'].concat([].slice.call(arguments))); } };
  try {
    var ctx = data.ctx || {};
    var result;
    if (data.mode === 'guard') {
      result = new Function('ctx', 'console', '"use strict";\\n' + data.code + '\\n;return runCustomGuard(ctx);')(ctx, con);
    } else {
      ctx.log = log;
      result = new Function('ctx', 'console', '"use strict";\\n' + data.code)(ctx, con);
      delete ctx.log;
    }
    var safe = result === undefined ? null : JSON.parse(JSON.stringify(result));
    self.postMessage({ ok: true, result: safe, logs: logs, memory: JSON.parse(JSON.stringify(ctx.memory || {})) });
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err), logs: logs });
  }
};`;

const FRAME_HTML = `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:">
</head><body><script>
var SRC = ${JSON.stringify(WORKER_SRC)};
window.addEventListener('message', function (e) {
  if (e.source !== parent) return;
  var id = e.data && e.data.id;
  var url = URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' }));
  var w;
  try { w = new Worker(url); } catch (err) { parent.postMessage({ id: id, ok: false, error: 'Sandbox worker failed: ' + err, logs: [] }, '*'); return; }
  w.onmessage = function (m) { var d = m.data || {}; d.id = id; parent.postMessage(d, '*'); w.terminate(); URL.revokeObjectURL(url); };
  w.onerror = function (ev) { ev.preventDefault(); parent.postMessage({ id: id, ok: false, error: ev.message || 'Script error', logs: [] }, '*'); w.terminate(); };
  w.postMessage({ code: e.data.code, ctx: e.data.ctx, mode: e.data.mode });
});
parent.postMessage({ ready: true }, '*');
</script></body></html>`;

export function runSandboxed(
  code: string,
  ctx: Record<string, any>,
  opts: { mode?: 'script' | 'guard'; timeoutMs?: number } = {}
): Promise<SandboxResult> {
  const mode = opts.mode || 'script';
  const timeoutMs = opts.timeoutMs ?? 2000;
  const start = performance.now();
  const id = `run-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.display = 'none';

    let done = false;
    const finish = (r: Omit<SandboxResult, 'timeMs'>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      iframe.remove();
      resolve({ ...r, timeMs: Math.round((performance.now() - start) * 100) / 100 });
    };

    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      const d = e.data || {};
      if (d.ready) {
        let payload: any;
        try {
          payload = { id, code, mode, ctx: JSON.parse(JSON.stringify(ctx)) };
        } catch {
          return finish({ ok: false, result: null, logs: [], error: 'Context is not serializable' });
        }
        iframe.contentWindow?.postMessage(payload, '*');
        return;
      }
      if (d.id !== id) return;
      finish({ ok: !!d.ok, result: d.result ?? null, logs: Array.isArray(d.logs) ? d.logs.map(String) : [], error: d.error, memory: d.memory });
    };

    const timer = setTimeout(
      () => finish({ ok: false, result: null, logs: [], error: `Timed out after ${timeoutMs} ms` }),
      timeoutMs
    );
    window.addEventListener('message', onMessage);
    iframe.srcdoc = FRAME_HTML;
    document.body.appendChild(iframe);
  });
}
