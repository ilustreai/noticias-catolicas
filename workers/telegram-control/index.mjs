const MENU_BUTTONS = [
  [
    { text: "Rodar agora", callback_data: "run_daily" },
    { text: "Contingencia", callback_data: "run_contingency" },
  ],
  [
    { text: "Status", callback_data: "status" },
    { text: "Relatorio", callback_data: "report" },
  ],
  [
    { text: "Ultimo erro", callback_data: "last_error" },
    { text: "Teste", callback_data: "test" },
  ],
];

const DAILY_WORKFLOW = "daily-news.yml";
const CONTINGENCY_WORKFLOW = "build-from-selection.yml";

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
  async scheduled(event, env) {
    try {
      await dispatchWorkflow(env, fetch, DAILY_WORKFLOW);
    } catch (err) {
      console.error('Scheduled dispatch failed:', err.message);
    }
  },
};

export async function handleRequest(request, env, fetchImpl = fetch) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.pathname === "/run-daily") {
      await dispatchWorkflow(env, fetchImpl, DAILY_WORKFLOW);
      return json({ ok: true, message: "workflow dispatched" });
    }
    return json({ ok: true, service: "ilustre telegram control" });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (headerSecret !== secret) {
      return json({ ok: false, error: "unauthorized_webhook" }, 401);
    }
  }

  const update = await request.json();
  await handleTelegramUpdate(update, env, fetchImpl);
  return json({ ok: true });
}

export async function handleTelegramUpdate(update, env, fetchImpl = fetch) {
  const message = update.message;
  const callback = update.callback_query;
  const chatId = message?.chat?.id ?? callback?.message?.chat?.id;
  const callbackId = callback?.id;

  if (!isAuthorizedChat(chatId, env)) {
    if (chatId) {
      await sendTelegram(env, fetchImpl, "Acesso nao autorizado.", chatId);
    }
    return;
  }

  if (callbackId) {
    await answerCallback(env, fetchImpl, callbackId);
  }

  const command = normalizeCommand(callback?.data ?? message?.text ?? "/menu");
  const response = await executeCommand(command, env, fetchImpl);
  await sendTelegram(env, fetchImpl, response.text, chatId, response.keyboard);
}

export async function executeCommand(command, env, fetchImpl = fetch) {
  switch (command) {
    case "menu":
      return {
        text: "Controle Noticias Catolicas - @ilustre.ai",
        keyboard: MENU_BUTTONS,
      };
    case "run_daily": {
      await dispatchWorkflow(env, fetchImpl, DAILY_WORKFLOW);
      return { text: "Comando enviado: rodar publicacao diaria." };
    }
    case "run_contingency": {
      await dispatchWorkflow(env, fetchImpl, CONTINGENCY_WORKFLOW);
      return { text: "Comando enviado: rodar contingencia/rebuild da selecao atual." };
    }
    case "status":
      return { text: await buildStatusReport(env, fetchImpl, false) };
    case "report":
      return { text: await buildStatusReport(env, fetchImpl, true) };
    case "last_error":
      return { text: await buildLastErrorReport(env, fetchImpl) };
    case "test":
      return { text: await buildTestReport(env, fetchImpl) };
    default:
      return {
        text: "Comando nao reconhecido. Use o menu abaixo.",
        keyboard: MENU_BUTTONS,
      };
  }
}

function normalizeCommand(text) {
  const value = String(text || "").trim().toLowerCase();
  const command = value.replace(/^\//, "").split(/\s+/)[0];
  const aliases = {
    start: "menu",
    menu: "menu",
    rodar: "run_daily",
    run: "run_daily",
    run_daily: "run_daily",
    contingencia: "run_contingency",
    run_contingency: "run_contingency",
    status: "status",
    relatorio: "report",
    report: "report",
    erro: "last_error",
    last_error: "last_error",
    teste: "test",
    test: "test",
  };
  return aliases[command] ?? command;
}

function isAuthorizedChat(chatId, env) {
  return String(chatId ?? "") === String(env.TELEGRAM_CHAT_ID ?? "");
}

async function dispatchWorkflow(env, fetchImpl, workflowFile) {
  const ref = env.GITHUB_REF || "main";
  const url = githubApiUrl(env, `/actions/workflows/${workflowFile}/dispatches`);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: githubHeaders(env),
    body: JSON.stringify({ ref }),
  });
  if (!response.ok) {
    throw new Error(`GitHub dispatch failed (${response.status}): ${await response.text()}`);
  }
}

async function buildStatusReport(env, fetchImpl, detailed) {
  const [runs, site] = await Promise.all([
    getWorkflowRuns(env, fetchImpl),
    checkPublicSite(env, fetchImpl),
  ]);
  const latest = runs[0];
  const lastSuccess = runs.find((run) => run.conclusion === "success");
  const lines = [
    "Status Noticias Catolicas",
    `Site: ${site.ok ? "OK" : "FALHA"} (${site.status || "sem status"})`,
    `Data no site: ${site.hasCurrentYear ? "JULHO/2026 detectado" : "nao confirmada"}`,
    `Noticias no HTML: ${site.newsItems}`,
    latest ? `Ultimo run: ${latest.name} - ${latest.status}/${latest.conclusion || "em andamento"}` : "Ultimo run: nao encontrado",
    lastSuccess ? `Ultimo sucesso: ${lastSuccess.name} - ${lastSuccess.created_at}` : "Ultimo sucesso: nao encontrado",
  ];

  if (detailed && latest) {
    lines.push(`Branch/SHA: ${latest.head_branch || "main"} / ${shortSha(latest.head_sha)}`);
    lines.push(`Link: ${latest.html_url}`);
  }

  return lines.join("\n");
}

async function buildLastErrorReport(env, fetchImpl) {
  const runs = await getWorkflowRuns(env, fetchImpl, 20);
  const failed = runs.find((run) => run.conclusion === "failure");
  if (!failed) {
    return "Nenhum erro recente encontrado nos ultimos runs consultados.";
  }
  return [
    "Ultimo erro encontrado",
    `Workflow: ${failed.name}`,
    `Criado em: ${failed.created_at}`,
    `SHA: ${shortSha(failed.head_sha)}`,
    `Link: ${failed.html_url}`,
  ].join("\n");
}

async function buildTestReport(env, fetchImpl) {
  const [runs, site, selection] = await Promise.all([
    getWorkflowRuns(env, fetchImpl, 5),
    checkPublicSite(env, fetchImpl),
    getDailySelection(env, fetchImpl),
  ]);
  const latest = runs[0];
  return [
    "Teste rapido Noticias Catolicas",
    `Site HTTP: ${site.status || "sem status"}`,
    `Hero: ${site.hasHero ? "OK" : "nao encontrado"}`,
    `Noticias no HTML: ${site.newsItems}`,
    `JSON remoto: ${selection.ok ? "OK" : "FALHA"}`,
    selection.date ? `Data JSON: ${selection.date}` : "Data JSON: nao encontrada",
    latest ? `Ultimo workflow: ${latest.name} - ${latest.conclusion || latest.status}` : "Workflow: nao encontrado",
  ].join("\n");
}

async function getWorkflowRuns(env, fetchImpl, perPage = 8) {
  const url = githubApiUrl(env, `/actions/runs?per_page=${perPage}`);
  const response = await fetchImpl(url, { headers: githubHeaders(env) });
  if (!response.ok) {
    throw new Error(`GitHub runs failed (${response.status}): ${await response.text()}`);
  }
  const data = await response.json();
  return data.workflow_runs || [];
}

async function getDailySelection(env, fetchImpl) {
  const url = githubApiUrl(env, "/contents/data/daily-selection.json?ref=main");
  const response = await fetchImpl(url, { headers: githubHeaders(env) });
  if (!response.ok) {
    return { ok: false };
  }
  const data = await response.json();
  const decoded = atob(data.content.replace(/\s/g, ""));
  const selection = JSON.parse(decoded);
  return {
    ok: true,
    date: selection.date,
    newsLength: Array.isArray(selection.news) ? selection.news.length : 0,
  };
}

async function checkPublicSite(env, fetchImpl) {
  const url = env.PUBLIC_SITE_URL || "https://noticias.ilustreai.com.br/";
  try {
    const response = await fetchImpl(url);
    const html = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      hasHero: html.includes('class="hero-title"'),
      hasCurrentYear: html.includes("JULHO DE 2026"),
      newsItems: (html.match(/class="news-item/g) || []).length,
    };
  } catch {
    return { ok: false, status: 0, hasHero: false, hasCurrentYear: false, newsItems: 0 };
  }
}

async function sendTelegram(env, fetchImpl, text, chatId = env.TELEGRAM_CHAT_ID, keyboard = null) {
  const body = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (keyboard) {
    body.reply_markup = { inline_keyboard: keyboard };
  }

  const response = await fetchImpl(telegramApiUrl(env, "sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Telegram send failed (${response.status}): ${await response.text()}`);
  }
}

async function answerCallback(env, fetchImpl, callbackQueryId) {
  await fetchImpl(telegramApiUrl(env, "answerCallbackQuery"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

function telegramApiUrl(env, method) {
  return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
}

function githubApiUrl(env, path) {
  return `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}${path}`;
}

function githubHeaders(env) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "content-type": "application/json",
    "user-agent": "ilustre-telegram-control",
    "x-github-api-version": "2022-11-28",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function shortSha(sha) {
  return sha ? sha.slice(0, 7) : "sem sha";
}
