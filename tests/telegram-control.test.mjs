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
  CLOUDFLARE_ACCOUNT_ID: "account-id",
  CLOUDFLARE_API_TOKEN: "cf-token",
};

test("menu returns Telegram inline buttons", async () => {
  const response = await executeCommand("menu", env, fakeFetch());
  assert.match(response.text, /Controle Noticias Catolicas/);
  assert.match(response.text, /\/horario/);
  assert.match(response.text, /\/agendar/);
  assert.match(response.text, /\/acessos/);
  assert.equal(response.keyboard.length, 3);
  assert.equal(response.keyboard[0][0].callback_data, "run_daily");
});

test("horario returns usage without arg", async () => {
  const response = await executeCommand("horario", env, fakeFetch(), "/horario");
  assert.match(response.text, /Uso/);
});

test("horario confirms the new time", async () => {
  const response = await executeCommand("horario", env, fakeFetch(), "/horario 08:00");
  assert.match(response.text, /08:00/);
  assert.match(response.text, /11:00/);
});

test("horario accepts multiple times", async () => {
  const response = await executeCommand("horario", env, fakeFetch(), "/horario 06:00,12:00,18:00");
  assert.match(response.text, /06:00/);
  assert.match(response.text, /12:00/);
  assert.match(response.text, /18:00/);
});

test("agendar returns usage without arg", async () => {
  const response = await executeCommand("agendar", env, fakeFetch(), "/agendar");
  assert.match(response.text, /Uso/);
});

test("agendar confirms scheduling", async () => {
  const response = await executeCommand("agendar", env, fakeFetch(), "/agendar 2026-07-20");
  assert.match(response.text, /Edicao extra agendada para 2026-07-20/);
});

test("agendamentos shows current config", async () => {
  const response = await executeCommand("agendamentos", env, fakeFetch());
  assert.match(response.text, /Horarios/);
});

test("cancelar returns not found for unknown date", async () => {
  const response = await executeCommand("cancelar", env, fakeFetch(), "/cancelar 2026-07-20");
  assert.match(response.text, /Nenhum agendamento encontrado/);
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

test("acessos shows analytics data", async () => {
  const response = await executeCommand("acessos", env, fakeFetch());
  assert.match(response.text, /Acessos/);
  assert.match(response.text, /6 visitas/);
  assert.match(response.text, /carregamentos/);
});

test("acessos sem config retorna erro", async () => {
  const envNoCf = { ...env, CLOUDFLARE_API_TOKEN: undefined };
  const response = await executeCommand("acessos", envNoCf, fakeFetch());
  assert.match(response.text, /nao configurado/);
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

    if (String(url).includes("api.cloudflare.com/client/v4/graphql")) {
      return response({
        data: {
          viewer: {
            accounts: [{
              rumPageloadEventsAdaptiveGroups: [
                { dimensions: { date: "2026-07-15" }, count: 6, sum: { visits: 6 } },
              ],
            }],
          },
        },
      });
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
