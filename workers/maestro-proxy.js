/**
 * C.I.B.O. / Basilico — Cloudflare Worker Free LLM Proxy
 * Deploy on Cloudflare Workers Free tier. Store keys in Worker Secrets:
 *   - GEMINI_API_KEY (optional)
 *   - GROQ_API_KEY (optional)
 *   - OPENROUTER_API_KEY (optional)
 *   - ALLOWED_ORIGIN (optional, e.g. "https://username.github.io")
 *
 * When all configured free keys hit quota/rate-limit, returns HTTP 429 so
 * traffic spikes are visible in Cloudflare Analytics without incurring billing.
 */

function corsHeaders(env, origin) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  const allowOrigin = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8'
  };
}

async function callGemini(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!res.ok) return { status: res.status, text: null };
  const data = await res.json();
  return { status: 200, text: data?.candidates?.[0]?.content?.parts?.[0]?.text || null };
}

async function callOpenAiCompatible(url, apiKey, model, prompt) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 450
    })
  });
  if (!res.ok) return { status: res.status, text: null };
  const data = await res.json();
  return { status: 200, text: data?.choices?.[0]?.message?.content || null };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const headers = corsHeaders(env, origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
    }

    const body = await request.json().catch(() => ({}));
    const message = String(body.message || '').trim().slice(0, 1500);
    if (!message) {
      return new Response(JSON.stringify({ error: 'Empty message' }), { status: 400, headers });
    }

    const context = JSON.stringify({
      rhythmPreset: body.rhythmPreset || 'feriale',
      paretoCards: (body.paretoCards || []).slice(0, 3)
    });
    const prompt = `Sei Basilico Maestro: la tua mente unisce la cucina tradizionale ligure (reverse engineering dei piatti reali dei ristoranti liguri), la nutrizione scientifica CREA e la fisica/scienza culinaria.\nContesto locale: ${context}\nDomanda utente: ${message}\nRispondi in italiano in modo conciso, pratico e fedele alla tradizione ligure.`;

    const attempts = [
      env.GEMINI_API_KEY && (() => callGemini(env.GEMINI_API_KEY, prompt)),
      env.GROQ_API_KEY && (() => callOpenAiCompatible('https://api.groq.com/openai/v1/chat/completions', env.GROQ_API_KEY, 'llama-3.1-8b-instant', prompt)),
      env.OPENROUTER_API_KEY && (() => callOpenAiCompatible('https://openrouter.ai/api/v1/chat/completions', env.OPENROUTER_API_KEY, 'meta-llama/llama-3.2-3b-instruct:free', prompt))
    ].filter(Boolean);

    let sawRateLimit = false;
    for (const run of attempts) {
      try {
        const result = await run();
        if (result.text) {
          return new Response(JSON.stringify({ reply: result.text, mode: 'cloudflare_worker_free_llm' }), { status: 200, headers });
        }
        if (result.status === 429) sawRateLimit = true;
      } catch (_) {}
    }

    return new Response(
      JSON.stringify({ error: sawRateLimit ? 'Free LLM quota exhausted' : 'No free LLM provider available' }),
      { status: 429, headers }
    );
  }
};
