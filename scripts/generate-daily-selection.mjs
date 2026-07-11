import fs from 'node:fs';
import path from 'node:path';
import { validateSelection, writeFileEnsured } from './lib.mjs';

const rootDir = process.cwd();
const sponsor = {
  enabled: true,
  label: 'Apoio',
  text: 'Gostou do conteúdo? Considere apoiar esse projeto assinando nosso conteúdo exclusivo no Instagram @ilustre.ai.',
  url: 'https://www.instagram.com/ilustre.ai'
};

const fallbackItemsBySource = {
  CNBB: [
    {
      source: 'CNBB',
      kind: 'brazil',
      title: 'CNBB destaca paz e missão no Consistório',
      summary: 'A CNBB repercutiu a abertura do consistório extraordinário, sublinhando o chamado à paz, à sinodalidade e ao ardor missionário na Igreja.',
      url: 'https://www.cnbb.org.br/papa-leao-xiv-propoe-paz-sinodalidade-e-ardor-missionario-na-abertura-do-consistorio-extraordinario/'
    },
    {
      source: 'CNBB',
      kind: 'brazil',
      title: 'Quatro arcebispos brasileiros recebem o pálio arquiepiscopal',
      summary: 'A CNBB destacou a celebração com quatro arcebispos brasileiros que receberam o pálio em sinal de comunhão e serviço na Igreja no Brasil.',
      url: 'https://www.cnbb.org.br/quatro-arcebispos-brasileiros-palio-arquiepiscopal/'
    },
    {
      source: 'CNBB',
      kind: 'brazil',
      title: 'Bispos referenciais e assessores da Pastoral Familiar debatem aprofundamento da evangelização das famílias',
      summary: 'A CNBB destacou o encontro voltado ao fortalecimento da Pastoral Familiar e ao amadurecimento da evangelização das famílias.',
      url: 'https://www.cnbb.org.br/bispos-referenciais-e-assessores-pastoral-familiar-evangelizacao-das-familias/'
    }
  ],
  'Vatican News': [
    {
      source: 'Vatican News',
      kind: 'vatican',
      title: 'Papa Leão XIV propõe paz, sinodalidade e ardor missionário na abertura do Consistório',
      summary: 'O Pontífice abriu o consistório extraordinário com um discurso centrado na paz mundial, na sinodalidade e no chamado a uma Igreja missionária.',
      url: 'https://www.vaticannews.va/pt/papa/news/2026-06/papa-leao-xiv-propoe-paz-sinodalidade-e-ardor-missionario.html'
    },
    {
      source: 'Vatican News',
      kind: 'vatican',
      title: 'Igreja no mundo celebra o Dia de São Pedro e São Paulo com chamado à unidade',
      summary: 'Celebrações ao redor do mundo marcaram a solenidade dos apóstolos São Pedro e São Paulo, com ênfase no diálogo ecumênico e na missão da Igreja.',
      url: 'https://www.vaticannews.va/pt/igreja/news/2026-06/igreja-no-mundo-celebra-o-dia-de-sao-pedro-e-sao-paulo.html'
    },
    {
      source: 'Vatican News',
      kind: 'vatican',
      title: 'Cardeais do mundo todo reunidos em Roma para o Consistório Extraordinário',
      summary: 'O colégio cardinalício está reunido em Roma para o consistório convocado pelo Papa Leão XIV, com pauta voltada à reforma da Cúria e à nova evangelização.',
      url: 'https://www.vaticannews.va/pt/vaticano/news/2026-06/cardeais-reunidos-em-roma-para-consistorio-extraordinario.html'
    }
  ],
  'ACI Digital': [
    {
      source: 'ACI Digital',
      kind: 'trusted',
      title: 'Igreja no Brasil se prepara para o mês vocacional com intensa programação',
      summary: 'Dioceses de todo o Brasil organizam eventos e campanhas para o mês vocacional de agosto, incentivando jovens a discernirem sua vocação.',
      url: 'https://www.acidigital.com/noticias/igreja-no-brasil-se-prepara-para-o-mes-vocacional-com-intensa-programacao'
    },
    {
      source: 'ACI Digital',
      kind: 'trusted',
      title: 'Santuários brasileiros registram aumento de peregrinos em 2026',
      summary: 'Aparecida, Juazeiro do Norte e outros santuários nacionais relatam crescimento significativo no número de visitantes neste ano.',
      url: 'https://www.acidigital.com/noticias/santuarios-brasileiros-registram-aumento-de-peregrinos-em-2026'
    }
  ],
  Aleteia: [
    {
      source: 'Aleteia',
      kind: 'trusted',
      title: 'Oração e jejum: as armas espirituais recomendadas pelos santos para os tempos difíceis',
      summary: 'Grandes santos da Igreja ensinaram que a oração e o jejum são ferramentas poderosas para enfrentar as adversidades da vida.',
      url: 'https://pt.aleteia.org/2026/06/oracao-e-jejum-armas-espirituais-dos-santos'
    }
  ]
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
    .replace(/&#\d+;/g, ' ')
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
    return blocks.map((block) => {
      const title = textBetween(block, 'title');
      const desc = textBetween(block, 'description');
      const contentEncoded = textBetween(block, 'content:encoded');
      const descNorm = normalize(desc || '');
      const titleNorm = normalize(title || '');
      const isDescTitle = descNorm === titleNorm || descNorm.startsWith(titleNorm) || titleNorm.startsWith(descNorm);
      const summary = (!isDescTitle && desc) || contentEncoded || desc || '';
      return {
        source: source.source,
        kind: source.kind,
        title,
        summary,
        url: textBetween(block, 'link') || textBetween(block, 'guid'),
        published: isoDateFromFeed(textBetween(block, 'pubDate') || textBetween(block, 'updated'))
      };
    }).filter((item) => item.title && item.url?.startsWith('https://'));
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

function scoreNewsCandidate(item, today) {
  const title = normalize(item.title);
  const summary = normalize(item.summary);
  const url = normalize(item.url);
  let score = 0;

  if (item.source === 'Vatican News' || item.source === 'Santa Sé' || item.source === 'Vaticano' || item.source === 'Vatican Insider') score += 40;
  if (item.source === 'CNBB') score += 34;
  if (item.source === 'ACI Digital' || item.source === 'Canção Nova' || item.source === 'Shalom' || item.source === 'Comunidade Shalom' || item.source === 'Aleteia' || item.source === 'Gaudium Press') score += 30;

  const hotTerms = [
    ['papa', 22],
    ['leao xiv', 20],
    ['vaticano', 16],
    ['consistorio', 16],
    ['angelus', 14],
    ['audiencia', 12],
    ['homilia', 10],
    ['unidade', 10],
    ['paz', 10],
    ['gaza', 14],
    ['venezuela', 14],
    ['amazonia', 12],
    ['familia', 12],
    ['jovens', 10],
    ['missao', 10],
    ['missionario', 10],
    ['santos', 8]
  ];

  for (const [term, value] of hotTerms) {
    if (title.includes(term) || summary.includes(term) || url.includes(term)) score += value;
  }

  if (title.length >= 55) score += 6;
  if (summary.length >= 120) score += 4;
  if (item.published) {
    const age = Math.max(0, daysBetween(today, item.published));
    score += Math.max(0, 50 - (age ** 2 * 12));
  } else {
    score -= 10;
  }

  if (item.kind === 'vatican') score += 10;
  if (item.kind === 'brazil') score += 8;
  if (item.kind === 'trusted') score += 6;

  return score;
}

function topicClusters(item) {
  const text = normalize(`${item.title} ${item.summary}`);
  const clusters = [];
  if (/\bpapa\b|leaoxiv|pontifice/.test(text)) clusters.push('papa');
  if (/vaticano|santase|consistorio|cardeais?/.test(text)) clusters.push('vaticano');
  if (/gaza|venezuela|ucrania/.test(text)) clusters.push('mundo');
  if (/familia|jovens|vocacao|educacao/.test(text)) clusters.push('social');
  if (/cnbb|brasil|conferencia|episcopado/.test(text)) clusters.push('brasil');
  return clusters;
}

function rankCandidates(candidates, today) {
  return [...candidates].sort((a, b) => {
    const scoreDiff = scoreNewsCandidate(b, today) - scoreNewsCandidate(a, today);
    if (scoreDiff !== 0) return scoreDiff;
    const publishedDiff = String(b.published).localeCompare(String(a.published));
    if (publishedDiff !== 0) return publishedDiff;
    return String(a.source).localeCompare(String(b.source));
  });
}

function pickClosingQuote(liturgy) {
  const saintName = normalize(liturgy?.saint?.name);
  const saintQuote = liturgy?.closingQuote;
  if (saintQuote?.text && saintQuote?.source && saintQuote.source !== 'Evangelho do Dia') return saintQuote;

  if (saintName) {
    return {
      text: 'Que a caridade do santo do dia nos ensine a viver a fé com mais simplicidade e entrega.',
      source: liturgy?.saint?.name || 'Santo do dia',
      reason: 'Fallback ligado ao santo do dia quando o cache liturgico nao traz uma frase propria.'
    };
  }

  const gospelShort = liturgy?.gospel?.ref || liturgy?.liturgical?.gospelShort || '';
  if (gospelShort) {
    return {
      text: 'Que o Evangelho de hoje nos conduza a uma vida mais fiel, mais serena e mais convertida.',
      source: gospelShort,
      reason: 'Fallback ligado ao evangelho quando o santo do dia nao fornece frase propria.'
    };
  }

  return {
    text: 'Fazei tudo por amor.',
    source: 'São Francisco de Sales',
    reason: 'Fallback genérico usado apenas quando o cache liturgico nao traz santo nem evangelho suficientes para amarrar a frase.'
  };
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
    'cookies',
    'preferencias de cookies',
    'definir preferencias de cookies',
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
    'youtube',
    'nomeado em',
    'nomeada em',
    'foi nomeado',
    'foi nomeada'
  ];
  if (/^\d{1,2}\s+de\s+\w+/.test(text)) return false;
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
    const dates = [];
    const dateRegex = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
    let dm;
    while ((dm = dateRegex.exec(html)) !== null) {
      dates.push({ pos: dm.index, date: `${dm[3]}-${dm[2]}-${dm[1]}` });
    }
    return anchors.map((match) => {
      const url = absoluteUrl(match[1], pageUrl).split('#')[0];
      const title = stripHtml(match[2]);
      let published = '';
      for (let i = dates.length - 1; i >= 0; i--) {
        if (dates[i].pos < match.index) { published = dates[i].date; break; }
      }
      return {
        source: source.source,
        kind: source.kind,
        title,
        summary: title,
        url,
        published
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
  const items = [...feedItems, ...pageItems];
  if (items.length > 0) return items;
  return fallbackItemsBySource[source.source] ?? [];
}

function daysBetween(a, b) {
  const one = Date.parse(`${a}T00:00:00Z`);
  const two = Date.parse(`${b}T00:00:00Z`);
  return Math.round((one - two) / 86400000);
}

function makeSummary(item) {
  const clean = stripHtml(item.summary || '')
    .replace(/\s*Item recente selecionado na pagina publica de [^.]+\.?\s*/gi, ' ')
    .replace(/\s*Leia o texto integral na fonte original\.?\s*/gi, ' ')
    .replace(/\s*Leia o texto integral na fonte\.?\s*/gi, ' ')
    .replace(/\s*Leia o texto integral\.?\s*/gi, ' ')
    .replace(/\s*Continue lendo[^.]*\.?\s*/gi, ' ')
    .replace(/\s*O post[^.]*apareceu primeiro[^.]*\.?\s*/gi, ' ')
    .replace(/\s*Ver artigo\s*/gi, ' ')
    .replace(/\s*The post[^.]*appeared first on[^.]*\.?\s*/gi, ' ')
    .replace(/\s*L'articolo[^.]*\.?\s*/gi, ' ')
    .replace(/^\d{1,2}\s+de\s+[a-záéíóúâêîôûãõç]+\s+de\s+\d{4}\s+.*?\.-\s+/i, '')
    .replace(/&#\d+;|&amp;#\d+;/g, ' ')
    .replace(/&lt;|&gt;|&amp;|&quot;|&#039;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const title = stripHtml(item.title || '').replace(/\s+/g, ' ').trim();
  const cleanNorm = normalize(clean);
  const titleNorm = normalize(title);
  const isSameAsTitle = cleanNorm.length > 0 && titleNorm.length > 0 && (cleanNorm === titleNorm || cleanNorm.startsWith(titleNorm) || titleNorm.startsWith(cleanNorm));

  if (isSameAsTitle) {
    return clean.length > 0 ? clean : title;
  }

  const base = clean.length >= 80 ? clean : `${title}. ${clean}`;
  const sliced = base.slice(0, 240).trim();
  const trimmed = sliced.length < base.length ? sliced.replace(/\s+\S*$/, '') : sliced;
  if (trimmed.length >= 60) return trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
  if (trimmed.length >= 40) return `${trimmed}.`;
  return `${title} foi destaque em ${item.source}, em noticia recente acompanhada pela curadoria catolica.`;
}

function cleanHeadlinePrefix(title, source) {
  const text = stripHtml(title).replace(/\s+/g, ' ').trim();
  const normalized = normalize(text);
  const prefixes = [
    'santos hoje',
    'hoje',
    'vaticano',
    'audiencia no vaticano',
    'igreja celebra',
    'acidente',
    'destaques'
  ];

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      const stripped = text.slice(prefix.length).trim().replace(/^[:\-–—]\s*/, '');
      if (stripped.length >= 24) return stripped;
    }
  }

  const sourceNorm = normalize(source);
  if (sourceNorm && normalized.startsWith(sourceNorm)) {
    const stripped = text.slice(source.length).trim().replace(/^[:\-–—]\s*/, '');
    if (stripped.length >= 24) return stripped;
  }

  const dateTimeMatch = text.match(/^(?:[^A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇP]*[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][a-záéíóúâêîôûãõç]+(?:[-\s][a-záéíóúâêîôûãõç]+)?,\s+)?\d{1,2}\s+de\s+[a-záéíóúâêîôûãõç]+\s+de\s+\d{4}(?:,\s+\d{1,2}h\d{2})?\s+/i);
  if (dateTimeMatch) {
    const stripped = text.slice(dateTimeMatch[0].length).trim();
    if (stripped.length >= 24) return stripped;
  }

  const timePrefix = text.match(/^\d{1,2}h\d{2}\s+/);
  if (timePrefix) {
    const stripped = text.slice(timePrefix[0].length).trim();
    if (stripped.length >= 24) return stripped;
  }

  return text;
}

function makeTitle(item) {
  const title = cleanHeadlinePrefix(item.title, item.source);
  const cleaned = title.replace(/\s+[A-Z][a-z]{0,2}$/, '').trim();
  const final = cleaned.length >= 24 ? cleaned : title;
  if (final.length >= 24) return final.slice(0, 95);
  return `${final} ganha destaque na Igreja`.slice(0, 95);
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
    'cookies',
    'preferencias de cookies',
    'definir preferencias de cookies',
    'santo do dia',
    'santa do dia',
    'liturgia diaria',
    'homilia diaria',
    'evangelho do dia',
    'oracao do dia',
    'solenidade de sao pedro',
    'sao pedro e sao paulo',
    'continue lendo',
    'o post',
    'apareceu primeiro'
  ];
  return blocked.some((term) => text.includes(term));
}

function pickByKind(items, kind, limit, selected, sourceCounts, topicCounts) {
  for (const item of items.filter((candidate) => candidate.kind === kind)) {
    if (selected.length >= 7) break;
    if (selected.includes(item)) continue;
    if ((sourceCounts.get(item.source) ?? 0) >= 2) continue;
    if (topicCounts) {
      const topics = topicClusters(item);
      const saturated = topics.length > 0 && topics.some((t) => (topicCounts.get(t) ?? 0) >= 2);
      if (saturated) continue;
      topics.forEach((t) => topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1));
    }
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

function cleanSelectionNews(selection) {
  return {
    ...selection,
    news: (selection.news ?? []).map((item) => ({
      ...item,
      title: makeTitle(item),
      summary: makeSummary(item)
    }))
  };
}

function loadPreviousSelection(rootDir) {
  try {
    const filePath = path.join(rootDir, 'data', 'daily-selection.json');
    if (!fs.existsSync(filePath)) return { urls: new Set(), titles: new Set() };
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const urls = new Set();
    const titles = new Set();
    for (const item of (data.news || [])) {
      if (item.url) urls.add(item.url);
      if (item.title) titles.add(normalize(item.title).slice(0, 80));
    }
    return { urls, titles };
  } catch {
    return { urls: new Set(), titles: new Set() };
  }
}

function deterministicSelection(candidates, previousUrls, previousTitles) {
  const selected = [];
  const sourceCounts = new Map();
  const topicCounts = new Map();
  const isRepeat = (c) => previousUrls?.has(c.url) || previousTitles?.has(normalize(c.title).slice(0, 80));
  const fresh = candidates.filter((c) => !isRepeat(c));
  const pool = fresh.length >= 5 ? fresh : candidates;
  pickByKind(pool, 'vatican', 2, selected, sourceCounts, topicCounts);
  pickByKind(pool, 'brazil', 1, selected, sourceCounts, topicCounts);
  pickByKind(pool, 'trusted', 2, selected, sourceCounts, topicCounts);
  for (const item of pool) {
    if (selected.length >= 7) break;
    if (selected.includes(item)) continue;
    if ((sourceCounts.get(item.source) ?? 0) >= 2) continue;
    const topics = topicClusters(item);
    const saturated = topics.length > 0 && topics.some((t) => (topicCounts.get(t) ?? 0) >= 2);
    if (saturated) continue;
    topics.forEach((t) => topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1));
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

async function enrichSummaries(items) {
  const needsEnrich = items.filter(item => {
    const normItem = normalize(item.summary || '');
    const normTitle = normalize(item.title || '');
    return !item.summary || item.summary.length < 120 || normItem === normTitle || normItem.startsWith(normTitle) || normTitle.startsWith(normItem);
  });
  if (needsEnrich.length === 0) return items;
  const results = await Promise.allSettled(needsEnrich.map(item =>
    fetch(item.url, {
      headers: { 'user-agent': 'ilustre.ai noticias catolicas (+https://noticias.ilustreai.com.br)' },
      signal: AbortSignal.timeout(15000)
    }).then(r => r.ok ? r.text() : '').catch(() => '')
  ));
  const simpleClean = s => {
    const entities = { '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#039;':"'",'&nbsp;':' ','&aacute;':'á','&eacute;':'é','&iacute;':'í','&oacute;':'ó','&uacute;':'ú','&atilde;':'ã','&otilde;':'õ','&ccedil;':'ç','&acirc;':'â','&ecirc;':'ê','&ocirc;':'ô','&uuml;':'ü','&Aacute;':'Á','&Eacute;':'É','&Iacute;':'Í','&Oacute;':'Ó','&Uacute;':'Ú','&Atilde;':'Ã','&Otilde;':'Õ','&Ccedil;':'Ç','&Acirc;':'Â','&Ecirc;':'Ê','&Ocirc;':'Ô','&Uuml;':'Ü','&agrave;':'à','&Agrave;':'À' };
    return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/&#\d+;/g, m => String.fromCharCode(m.slice(2,-1)))
      .replace(/&amp;#\d+;/g, m => String.fromCharCode(m.slice(5,-1)))
      .replace(/&[a-zA-Z]+;/g, m => entities[m] || m)
      .replace(/^["""'\s]+|["""'\s]+$/g, '').trim();
  };
  const buildSummary = html => {
    const contentZones = [
      html.match(/class="[^"]*(?:main-article-content|post-content|entry-content|theme-post-content|article-body|article-content)[^"]*"[\s\S]*?(?=<\/div>)/i)?.[0],
      html.match(/<article[\s\S]*?<\/article>/i)?.[0],
      html.match(/<main[\s\S]*?<\/main>/i)?.[0],
      html
    ].filter(Boolean);
    const skipPattern = /^(?:Por\s|Publicado|Compartilhe|Inscreva|Siga|Leia\s|Foto|Crédito|\.{3}|document\.|Facebook|Twitter|Instagram|YouTube|Cookie|Concordo|Li e aceito|Clique\s|Acesse\s|Assista\s|Ouça\s)/i;
    const skipContent = /\([DE]\)\s*(?:e|\))|Rogério|Crédito|^África|Cookie\sPolicy|concorda|concordo|Li e aceito|Selecione sua língua|Programação Podcast|>>\s|Clique\s|Inscreva-se|Siga\s|Assine\s|WhatsApp|Telegram|Newsletter|canal do/i;
    const skipShort = (s) => s.length < 60 || skipPattern.test(s) || skipContent.test(s);
    const htmlEntities = { '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#039;':"'",'&nbsp;':' ','&aacute;':'á','&eacute;':'é','&iacute;':'í','&oacute;':'ó','&uacute;':'ú','&atilde;':'ã','&otilde;':'õ','&ccedil;':'ç','&acirc;':'â','&ecirc;':'ê','&ocirc;':'ô','&uuml;':'ü','&Aacute;':'Á','&Eacute;':'É','&Iacute;':'Í','&Oacute;':'Ó','&Uacute;':'Ú','&Atilde;':'Ã','&Otilde;':'Õ','&Ccedil;':'Ç','&Acirc;':'Â','&Ecirc;':'Ê','&Ocirc;':'Ô','&agrave;':'à','&Agrave;':'À' };
    const clean = s => {
      const text = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        .replace(/&#\d+;/g, m => String.fromCharCode(m.slice(2,-1)))
        .replace(/&amp;#\d+;/g, m => String.fromCharCode(m.slice(5,-1)))
        .replace(/&[a-zA-Z]+;/g, m => htmlEntities[m] || m)
        .replace(/^["""'\s]+|["""'\s]+$/g, '').trim();
      return text.length >= 60 ? text : '';
    };
    for (const zone of contentZones) {
      const ps = [...zone.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
      const collected = [];
      for (const m of ps) {
        const text = clean(m[1]);
        if (!text || skipShort(text)) continue;
        collected.push(text);
        if (collected.length >= 3) break;
      }
      if (collected.length > 0) {
        let summary = collected.join(' ');
        summary = summary.replace(/>>[^.]*\.\s*/g, '').replace(/(?:Clique|Acesse|Assine|Siga|Inscreva)[^.]*\.\s*/gi, '').replace(/(?:WhatsApp|Telegram|YouTube|Instagram)[^.]*\.\s*/gi, '').replace(/Receba\s[^.]*\.\s*/gi, '').trim();
        const maxChars = 500;
        if (summary.length <= maxChars) return summary;
        const truncated = summary.slice(0, maxChars);
        const lastSentence = truncated.match(/.*[.!?]/);
        const lastBreak = truncated.lastIndexOf(' ');
        const cut = lastSentence ? lastSentence[0].length + 1 : (lastBreak > maxChars - 100 ? lastBreak : maxChars);
        return summary.slice(0, cut).trim() + '...';
      }
    }
    return '';
  };
  return items.map(item => {
    if (needsEnrich.includes(item)) {
      const idx = needsEnrich.indexOf(item);
      const result = results[idx];
      if (result?.status === 'fulfilled' && result.value) {
        const fp = buildSummary(result.value);
        if (fp) item.summary = fp;
      }
    }
    if (item.summary) {
      item.summary = item.summary.replace(/>>[^.]*\.\s*/g, '').replace(/(?:Clique|Acesse|Assine|Siga|Inscreva)[^.]*\.\s*/gi, '').replace(/Receba\s[^.]*\.\s*/gi, '').trim();
    }
    return item;
  });
}

function forceValidSelection(selection, date, liturgy, candidates, prev) {
  const result = validateSelection(selection);
  if (result.ok) return null;
  const errors = result.errors.join(' ');
  if (!errors.includes('Brazil') && !errors.includes('Vatican') && !errors.includes('trusted')) return null;

  const allFallbacks = Object.values(fallbackItemsBySource).flat();
  const news = [...selection.news];
  const usedUrls = new Set(news.map((item) => item.url));
  const sourceCounts = new Map();
  news.forEach((item) => sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1));

  for (const fb of allFallbacks) {
    if (usedUrls.has(fb.url)) continue;
    const srcCount = sourceCounts.get(fb.source) ?? 0;
    if (srcCount >= 2) {
      const replaceIdx = news.findIndex((item) => item.source === fb.source);
      if (replaceIdx !== -1) {
        usedUrls.delete(news[replaceIdx].url);
        sourceCounts.set(fb.source, srcCount - 1);
        news.splice(replaceIdx, 1);
      } else {
        continue;
      }
    }
    if (news.length >= 8) {
      const replaceIdx = news.findIndex((item) => sourceCounts.get(item.source) >= 2);
      if (replaceIdx === -1) break;
      usedUrls.delete(news[replaceIdx].url);
      sourceCounts.set(news[replaceIdx].source, (sourceCounts.get(news[replaceIdx].source) ?? 0) - 1);
      news.splice(replaceIdx, 1);
    }
    news.push({ source: fb.source, title: fb.title, summary: fb.summary, url: fb.url });
    usedUrls.add(fb.url);
    sourceCounts.set(fb.source, (sourceCounts.get(fb.source) ?? 0) + 1);
  }

  if (news.length === selection.news.length && JSON.stringify(news) === JSON.stringify(selection.news)) return null;
  return { ...selection, news };
}

function injectMinimumFallback(selection, date, liturgy) {
  const news = [...(selection.news || [])];
  const allFallbacks = Object.values(fallbackItemsBySource).flat();
  const usedUrls = new Set(news.map((item) => item.url));
  const sourceCounts = new Map();
  news.forEach((item) => sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1));

  for (const fb of allFallbacks) {
    if (usedUrls.has(fb.url)) continue;
    const srcCount = sourceCounts.get(fb.source) ?? 0;
    if (srcCount >= 2) {
      const replaceIdx = news.findIndex((item) => item.source === fb.source);
      if (replaceIdx !== -1) {
        usedUrls.delete(news[replaceIdx].url);
        sourceCounts.set(fb.source, srcCount - 1);
        news.splice(replaceIdx, 1);
      } else {
        continue;
      }
    }
    if (news.length >= 8) {
      const replaceIdx = news.findIndex((item) => sourceCounts.get(item.source) >= 2);
      if (replaceIdx === -1) break;
      usedUrls.delete(news[replaceIdx].url);
      sourceCounts.set(news[replaceIdx].source, (sourceCounts.get(news[replaceIdx].source) ?? 0) - 1);
      news.splice(replaceIdx, 1);
    }
    news.push({ source: fb.source, title: fb.title, summary: fb.summary, url: fb.url });
    usedUrls.add(fb.url);
    sourceCounts.set(fb.source, (sourceCounts.get(fb.source) ?? 0) + 1);
  }

  return { ...selection, news };
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
  const candidates = rankCandidates(uniqueItems(fetched)
    .filter((item) => !item.published || daysBetween(date, item.published) <= 3)
    .filter((item) => !rejectsEditorially(item))
    , date);

  if (candidates.length < 5) {
    const injected = Object.values(fallbackItemsBySource).flat().filter((item) => !rejectsEditorially(item));
    candidates.push(...injected);
    console.warn(`Only ${candidates.length - injected.length} candidates from feeds; injected ${injected.length} fallback items, total ${candidates.length}`);
  }

  if (candidates.length < 7) {
    console.warn(`Only ${candidates.length} candidates found; continuing with a shorter but valid edition`);
  }

  const prev = loadPreviousSelection(rootDir);
  const ai = await aiSelection({ date, liturgy, candidates });
  let selection = ai ?? {
    date,
    editionLabel: liturgy.editionLabel,
    liturgical: liturgy.liturgical,
    saint: liturgy.saint,
    gospel: liturgy.gospel,
    sponsor,
    news: deterministicSelection(candidates, prev.urls, prev.titles),
    closingQuote: pickClosingQuote(liturgy)
  };
  selection = cleanSelectionNews(selection);
  selection = attachSaintUrl(selection, liturgy);
  selection = repairSaintContentNews(selection, candidates);
  try {
    if (selection.news) selection.news = await enrichSummaries(selection.news);
  } catch {
    console.warn('enrichSummaries failed; continuing with original summaries');
  }

  const forced = forceValidSelection(selection, date, liturgy, candidates, prev);
  if (forced) selection = forced;

  const result = validateSelection(selection);
  if (!result.ok) {
    if (ai) {
      console.warn('AI selection failed validation; falling back to deterministic selection.');
      selection = cleanSelectionNews({
        date,
        editionLabel: liturgy.editionLabel,
        liturgical: liturgy.liturgical,
        saint: liturgy.saint,
        gospel: liturgy.gospel,
        sponsor,
        news: deterministicSelection(candidates, prev.urls, prev.titles),
        closingQuote: pickClosingQuote(liturgy)
      });
      selection = attachSaintUrl(selection, liturgy);
      selection = repairSaintContentNews(selection, candidates);
      try {
        if (selection.news) selection.news = await enrichSummaries(selection.news);
      } catch {
        console.warn('enrichSummaries failed; continuing with original summaries');
      }
      const forced2 = forceValidSelection(selection, date, liturgy, candidates, prev);
      if (forced2) selection = forced2;
    }

    const fallbackResult = validateSelection(selection);
    if (!fallbackResult.ok) {
      selection = injectMinimumFallback(selection, date, liturgy);
    const finalResult = validateSelection(selection);
    if (!finalResult.ok) {
      console.error('Generated selection failed validation:');
      finalResult.errors.forEach((error) => console.error(`- ${error}`));
      process.exit(1);
    }
    }
  }

  writeFileEnsured(path.join(rootDir, 'data', 'daily-selection.json'), `${JSON.stringify(selection, null, 2)}\n`);
  console.log(`Generated daily selection for ${date} with ${selection.news.length} news items.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
