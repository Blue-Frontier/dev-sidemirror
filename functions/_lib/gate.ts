interface GateOptions {
  siteKey: string
  next: string
  error?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderGate({ siteKey, next, error }: GateOptions): string {
  const safeNext = escapeHtml(next)
  const safeKey = escapeHtml(siteKey)
  const errorBlock = error ? `<p class="error">${escapeHtml(error)}</p>` : ''

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>人机验证 · Dev SideMirror</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8fafc; color: #0f172a;
        font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
      .card { width: min(420px, calc(100vw - 2rem)); padding: 2rem; border-radius: 12px; background: #fff;
        border: 1px solid #e2e8f0; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); text-align: center; }
      h1 { margin: 0 0 0.5rem; font-size: 1.15rem; }
      p { margin: 0 0 1.25rem; font-size: 0.85rem; color: #475569; }
      .error { color: #dc2626; }
      button { margin-top: 1rem; padding: 0.5rem 1.5rem; border: 0; border-radius: 8px; background: #3b82f6;
        color: #fff; font-size: 0.9rem; cursor: pointer; }
      button:disabled { background: #94a3b8; cursor: not-allowed; }
      @media (prefers-color-scheme: dark) {
        body { background: #0f172a; color: #f1f5f9; }
        .card { background: #1e293b; border-color: #334155; box-shadow: none; }
        p { color: #94a3b8; }
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>请先完成人机验证</h1>
      <p>验证通过后 7 天内无需重复验证。</p>
      <form method="POST" action="/api/verify">
        <input type="hidden" name="next" value="${safeNext}" />
        <div class="cf-turnstile" data-sitekey="${safeKey}" data-callback="onTurnstilePass"></div>
        <input type="hidden" name="cf-turnstile-response" id="turnstile-response" />
        ${errorBlock}
        <button type="submit" id="continue" disabled>继续</button>
      </form>
    </main>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <script>
      function onTurnstilePass(token) {
        document.getElementById('turnstile-response').value = token
        document.getElementById('continue').disabled = false
        document.querySelector('form').submit()
      }
    </script>
  </body>
</html>`
}
