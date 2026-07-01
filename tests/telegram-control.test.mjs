import test from "node:test";
import assert from "node:assert/strict";

import { executeCommand, handleTelegramUpdate } from "../workers/telegram-control/index.mjs";

const env = {
  TELEGRAM_BOT_TOKEN: "telegram-token",
  TELEGRAM_CHAT_ID: "283402427",
  GITHUB_TOKEN: "github-token",
  GITHUB_OWNER: "ilustreai",
  GITHUB_REPO: "noticias-catolicas",
  GITHUB_REF: "main",
  PUBLIC_SITE_URL: "https://noticias.ilustreai.com.br/",
};

test("menu returns Telegram inline buttons", async () => {
  const response = await executeCommand("menu", env, fakeFetch());
  assert.match(response.text, /Controle Noticias Catolicas/);
  assert.equal(response.keyboard.length, 3);
  assert.equal(response.keyboard[0][0].callback_data, "run_daily");
});

test("run_daily dispatches the daily workflow", async () => {
  const calls = [];
  const response = await executeCommand("run_daily", env, fakeFetch(calls));
  assert.match(response.text, /rodar publicacao diaria/);
  assert.equal(calls[0].url, "https://api.github.com/repos/ilustreai/noticias-catolicas/actions/workflows/daily-news.yml/dispatches");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { ref: "main" });
});

test("run_contingency dispatches the rebuild workflow", async () => {
  const calls = [];
  await executeCommand("run_contingency", env, fakeFetch(calls));
  assert.equal(calls[0].url, "https://api.github.com/repos/ilustreai/noticias-catolicas/actions/workflows/build-from-selection.yml/dispatches");
});

test("status combines GitHub runs and public site checks", async () => {
  const response = await executeCommand("status", env, fakeFetch());
  assert.match(response.text, /Status Noticias Catolicas/);
  assert.match(response.text, /Site: OK/);
  assert.match(response.text, /Ultimo run: Daily Catholic News/);
});

test("test command checks public site and remote JSON without dispatching", async () => {
  const calls = [];
  const response = await executeCommand("test", env, fakeFetch(calls));
  assert.match(response.text, /Teste rapido Noticias Catolicas/);
  assert.match(response.text, /JSON remoto: OK/);
  assert.equal(calls.some((call) => call.url.includes("/dispatches")), false);
});

test("unauthorized chat receives no GitHub command", async () => {
  const calls = [];
  await handleTelegramUpdate(
    { message: { text: "/rodar", chat: { id: "999" } } },
    env,
    fakeFetch(calls),
  );
  assert.equal(calls.some((call) => call.url.includes("api.github.com")), false);
  assert.equal(calls.some((call) => call.url.includes("sendMessage")), true);
});

function fakeFetch(calls = []) {
  return async (url, options = {}) => {
    calls.push({ url: String(url), options });

    if (String(url).includes("/dispatches")) {
      return response(null, 204);
    }

    if (String(url).includes("/actions/runs")) {
      return response({
        workflow_runs: [
          {
            name: "Daily Catholic News",
            status: "completed",
            conclusion: "success",
            created_at: "2026-07-01T18:01:42Z",
            head_sha: "32f4fa28373bd28d4b90ac69145be4a09e5b8d2b",
            head_branch: "main",
            html_url: "https://github.com/ilustreai/noticias-catolicas/actions/runs/1",
          },
        ],
      });
    }

    if (String(url).includes("/contents/data/daily-selection.json")) {
      return response({
        content: btoa(JSON.stringify({ date: "2026-07-01", news: [{}, {}, {}, {}, {}, {}, {}] })),
      });
    }

    if (String(url).includes("noticias.ilustreai.com.br")) {
      return new Response('<h1 class="hero-title">A Igreja viva</h1><article class="news-item"></article>'.repeat(7), { status: 200 });
    }

    if (String(url).includes("api.telegram.org")) {
      return response({ ok: true });
    }

    throw new Error(`Unhandled fake fetch URL: ${url}`);
  };
}

function response(body, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
