import fs from 'node:fs';
import path from 'node:path';
import { validateSelection, writeFileEnsured } from './lib.mjs';

const rootDir = process.cwd();
const sponsor = {
  enabled: true,
  label: 'Apoio',
  text: 'Gostou do conteudo? Considere apoiar esse projeto assinando nosso conteudo exclusivo no Instagram @ilustre.ai.',
  url: 'https://www.instagram.com/ilustre.ai'
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function todayInSaoPaulo() {
  if (process.env.SELECTION_DATE) return process.env.SELECTION_DATE;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeXml(value) {
  return stripHtml(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function textBetween(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function isoDateFromFeed(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  return new Date(time).toISOString().slice(0, 10);
}

async function fetchFeed(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(source.feedUrl, {
      headers: { 'user-agent': 'ilustre.ai noticias catolicas (+https://noticias.ilustreai.com.br)' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const xml = await response.text();
    const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
    return blocks.map((block) => ({
      source: source.source,
      kind: source.kind,
      title: textBetween(block, 'title'),
      summary: textBetween(block, 'description') || textBetween(block, 'content:encoded'),
      url: textBetween(block, 'link') || textBetween(block, 'guid'),
      published: isoDateFromFeed(textBetween(block, 'pubDate') || textBetween(block, 'updated'))
    })).filter((item) => item.title && item.url?.startsWith('https://'));
  } catch (error) {
    console.error(`Feed failed: ${source.source} - ${error.message}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return '';
  }
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function likelyArticleUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const text = normalize(url);
  const blocked = ['tag', 'category', 'author', 'login', 'wp content', 'facebook', 'instagram', 'youtube'];
  if (blocked.some((term) => text.includes(term))) return false;
  if (parsed.pathname === '/' || parsed.pathname === '') return false;
  if (parsed.pathname.includes('_')) return false;
  if (parsed.pathname === '/organismos/') return false;
  if (/\/pt\.html$/i.test(url)) return false;
  if (/\/(pt|en|es|it|fr|de)\.html$/i.test(url)) return false;
  return /^https:\/\//.test(url);
}

function likelyNewsTitle(title) {
  const text = normalize(title);
  if (title.length < 24) return false;
  const blocked = [
    'santo do dia',
    'santa do dia',
    'liturgia diaria',
    'homilia diaria',
    'formacao',
    'podcast',
    'newsletter',
    'menu',
    'todas as noticias',
    'ultimas noticias',
    'noticias a servico da vida e da esperanca',
    'conselho economico fiscal',
    'instagram',
    'youtube'
  ];
  return !blocked.some((term) => text.includes(term));
}

async function fetchPage(source, pageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(pageUrl, {
      headers: { 'user-agent': 'ilustre.ai noticias catolicas (+https://noticias.ilustreai.com.br)' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const html = await response.text();
    const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    return anchors.map((match) => {
      const url = absoluteUrl(match[1], pageUrl).split('#')[0];
      const title = stripHtml(match[2]);
      return {
        source: source.source,
        kind: source.kind,
        title,
        summary: `${title}. Item recente selecionado na pagina publica de ${source.source}. Leia o texto integral na fonte original.`,
        url,
        published: ''
      };
    }).filter((item) => likelyArticleUrl(item.url) && likelyNewsTitle(item.title));
  } catch (error) {
    console.error(`Page failed: ${source.source} ${pageUrl} - ${error.message}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSource(source) {
  const feedItems = source.feedUrl ? await fetchFeed(source) : [];
  const pageItems = (await Promise.all((source.pageUrls ?? []).map((url) => fetchPage(source, url)))).flat();
  return [...feedItems, ...pageItems];
}

function daysBetween(a, b) {
  const one = Date.parse(`${a}T00:00:00Z`);
  const two = Date.parse(`${b}T00:00:00Z`);
  return Math.round((one - two) / 86400000);
}

function makeSummary(item) {
  const clean = stripHtml(item.summary || '');
  const base = clean.length >= 80 ? clean : `${item.title}. ${clean}`;
  const trimmed = base.slice(0, 210).replace(/\s+\S*$/, '').trim();
  const sentence = trimmed.length >= 40 ? trimmed : `${item.title} foi destaque em ${item.source}, em noticia recente acompanhada pela curadoria catolica.`;
  return sentence.endsWith('.') ? sentence : `${sentence}.`;
}

function makeTitle(item) {
  const title = stripHtml(item.title).replace(/\s+/g, ' ').trim();
  if (title.length >= 24) return title.slice(0, 95);
  return `${title} ganha destaque na Igreja`.slice(0, 95);
}

function uniqueItems(items) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const output = [];
  for (const item of items) {
    const titleKey = normalize(item.title).slice(0, 80);
    if (seenUrls.has(item.url) || seenTitles.has(titleKey)) continue;
    seenUrls.add(item.url);
    seenTitles.add(titleKey);
    output.push(item);
  }
  return output;
}

function rejectsEditorially(item) {
  const text = normalize(`${item.title} ${item.summary} ${item.url}`);
  const blocked = [
    'santo do dia',
    'santa do dia',
    'liturgia diaria',
    'homilia diaria',
    'evangelho do dia',
    'oracao do dia',
    'solenidade de sao pedro',
    'sao pedro e sao paulo'
  ];
  return blocked.some((term) => text.includes(term));
}

function pickByKind(items, kind, limit, selected, sourceCounts) {
  for (const item of items.filter((candidate) => candidate.kind === kind)) {
    if (selected.length >= 7) break;
    if (selected.includes(item)) continue;
    if ((sourceCounts.get(item.source) ?? 0) >= 2) continue;
    selected.push(item);
    sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);
    if (selected.filter((candidate) => candidate.kind === kind).length >= limit) break;
  }
}

function saintUrlFromLiturgy(liturgy) {
  return liturgy?.saint?.url || liturgy?.sourceUrls?.saint || '';
}

function attachSaintUrl(selection, liturgy) {
  const saintUrl = saintUrlFromLiturgy(liturgy);
  if (!saintUrl) return selection;
  return {
    ...selection,
    saint: {
      ...selection.saint,
      url: selection.saint?.url || saintUrl
    }
  };
}

function deterministicSelection(candidates) {
  const selected = [];
  const sourceCounts = new Map();
  pickByKind(candidates, 'vatican', 2, selected, sourceCounts);
  pickByKind(candidates, 'brazil', 1, selected, sourceCounts);
  pickByKind(candidates, 'trusted', 2, selected, sourceCounts);
  for (const item of candidates) {
    if (selected.length >= 7) break;
    if (selected.includes(item)) continue;
    if ((sourceCounts.get(item.source) ?? 0) >= 2) continue;
    selected.push(item);
    sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);
  }
  return selected.map((item) => ({
    source: item.source,
    title: makeTitle(item),
    summary: makeSummary(item),
    url: item.url
  }));
}

function toNewsItem(item) {
  return {
    source: item.source,
    title: makeTitle(item),
    summary: makeSummary(item),
    url: item.url
  };
}

function hasSaintContentError(selection, newsItem) {
  const result = validateSelection({ ...selection, news: [newsItem] });
  return result.errors.some((error) => error === 'news[0].saint content must stay in saint block');
}

function repairSaintContentNews(selection, candidates) {
  const result = validateSelection(selection);
  const indexes = result.errors
    .map((error) => error.match(/^news\[(\d+)\]\.saint content must stay in saint block$/)?.[1])
    .filter((index) => index != null)
    .map(Number)
    .sort((a, b) => b - a);

  if (indexes.length === 0) return selection;

  const news = [...selection.news];
  for (const index of indexes) news.splice(index, 1);

  const usedUrls = new Set(news.map((item) => item.url));
  const sourceCounts = new Map();
  news.forEach((item) => sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1));

  for (const candidate of candidates) {
    if (news.length >= 7) break;
    const item = toNewsItem(candidate);
    if (usedUrls.has(item.url)) continue;
    if ((sourceCounts.get(item.source) ?? 0) >= 2) continue;
    if (hasSaintContentError({ ...selection, news }, item)) continue;
    news.push(item);
    usedUrls.add(item.url);
    sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);
  }

  return { ...selection, news };
}

async function aiSelection({ date, liturgy, candidates }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Voce e editor catolico. Responda apenas JSON valido no schema pedido. Nao copie materias integrais. Use no maximo 2 noticias por fonte, 7 noticias, ao menos 2 Vatican News, 1 CNBB e 2 fontes catolicas confiaveis.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          date,
          liturgy,
          sponsor,
          candidates: candidates.slice(0, 40),
          requiredSchema: {
            date: 'YYYY-MM-DD',
            editionLabel: 'string',
            liturgical: 'from liturgy.liturgical',
            saint: 'from liturgy.saint',
            gospel: 'from liturgy.gospel',
            sponsor: 'provided sponsor',
            news: [{ source: 'allowed source', title: '24+ chars', summary: '40+ chars', url: 'https URL' }],
            closingQuote: 'from liturgy.closingQuote when available'
          }
        })
      }
    ]
  };
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    console.error(`OpenAI failed: ${response.status} ${await response.text()}`);
    return null;
  }
  const payload = await response.json();
  return JSON.parse(payload.choices[0].message.content);
}

async function main() {
  const date = todayInSaoPaulo();
  const calendar = readJson(path.join(rootDir, 'data', 'liturgical-calendar-2026.json'));
  const liturgy = calendar.entries?.[date];
  if (!liturgy || liturgy.status !== 'complete') {
    throw new Error(`No complete liturgical cache for ${date}`);
  }

  const sources = readJson(path.join(rootDir, 'data', 'news-sources.json'));
  const fetched = (await Promise.all(sources.map(fetchSource))).flat();
  const candidates = uniqueItems(fetched)
    .filter((item) => !item.published || daysBetween(date, item.published) <= 3)
    .filter((item) => !rejectsEditorially(item))
    .sort((a, b) => String(b.published).localeCompare(String(a.published)));

  if (candidates.length < 7) {
    throw new Error(`Only ${candidates.length} valid candidates found`);
  }

  const ai = await aiSelection({ date, liturgy, candidates });
  let selection = ai ?? {
    date,
    editionLabel: liturgy.editionLabel,
    liturgical: liturgy.liturgical,
    saint: liturgy.saint,
    gospel: liturgy.gospel,
    sponsor,
    news: deterministicSelection(candidates),
    closingQuote: liturgy.closingQuote
  };
  selection = attachSaintUrl(selection, liturgy);
  selection = repairSaintContentNews(selection, candidates);

  const result = validateSelection(selection);
  if (!result.ok) {
    console.error('Generated selection failed validation:');
    result.errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  writeFileEnsured(path.join(rootDir, 'data', 'daily-selection.json'), `${JSON.stringify(selection, null, 2)}\n`);
  console.log(`Generated daily selection for ${date} with ${selection.news.length} news items.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
