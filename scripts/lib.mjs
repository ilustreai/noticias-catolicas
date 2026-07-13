import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export const internalTerms = [
  'teste manual',
  'revalidar',
  'não confirmado',
  'alerta interno',
  'confiança alta',
  'confiança editorial'
];

const allowedSourceKeys = new Set([
  'Vatican News',
  'Santa Sé',
  'Vaticano',
  'CNBB',
  'ACI Digital',
  'Canção Nova',
  'Comunidade Shalom',
  'Shalom',
  'Aleteia',
  'Gaudium Press',
  'Vatican Insider'
].map((source) => sourceKey(source)));

const vaticanSourceKeys = new Set(['Vatican News', 'Santa Sé', 'Vaticano', 'Vatican Insider'].map((source) => sourceKey(source)));
const brazilSourceKeys = new Set(['CNBB'].map((source) => sourceKey(source)));
const trustedCatholicSourceKeys = new Set([
  'ACI Digital',
  'Canção Nova',
  'Comunidade Shalom',
  'Shalom',
  'Aleteia',
  'Gaudium Press'
].map((source) => sourceKey(source)));
const liturgicalRanks = new Set(['tempo', 'memoria', 'festa', 'solenidade']);

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function sourceKey(source) {
  return normalizeText(source).replace(/[^a-z0-9]/g, '');
}

function hasInternalTerm(value) {
  const text = normalizeText(value);
  return internalTerms.find((term) => text.includes(normalizeText(term)));
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isArticleUrl(value) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    if (pathname === '/') return false;
    const segments = pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => normalizeText(segment).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    const menuSegments = new Set([
      'organismos',
      'institucional',
      'sobre',
      'quem-somos',
      'contato',
      'expediente',
      'conselho-economico-fiscal'
    ]);
    if (segments.length <= 1 && menuSegments.has(segments[0])) return false;
    if (segments.some((segment) => segment.startsWith('conselho-economico'))) return false;
    if (pathname.includes('_')) return false;
    if (/\/(pt|en|es|it|fr|de)\.html$/i.test(pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function hasEditorialResidue(value) {
  const text = String(value ?? '');
  return [
    /Continue lendo/i,
    /&#(?:x?[0-9a-f]+);/i,
    /&amp;#(?:x?[0-9a-f]+);/i,
    /O post .* apareceu primeiro/i,
    /L'articolo .+$/i
  ].some((pattern) => pattern.test(text));
}

function sourceCount(news, sourceSet) {
  return news.filter((item) => sourceSet.has(sourceKey(item.source))).length;
}

function saintNameTokens(name) {
  return normalizeText(name)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 6 && !['santo', 'santa', 'bento', 'pedro', 'paulo', 'joao', 'maria', 'jose', 'frei', 'padre', 'bispo', 'igreja', 'cristo', 'jesu'].includes(token));
}

function looksLikeSaintContent(item, saint) {
  const text = normalizeText(`${item.title} ${item.summary} ${item.url}`);
  const explicitTerms = ['santo do dia', 'santa do dia', 'festa liturgica'];
  if (explicitTerms.some((term) => text.includes(term))) return true;
  const tokens = saintNameTokens(saint?.name);
  if (tokens.length === 0) return false;
  const matches = tokens.filter((token) => text.includes(token));
  return matches.length >= 2;
}

const ROMAN_MAP = (function () {
  var m = {}, val = { I:1, V:5, X:10, L:50, C:100 };
  function parse(s) {
    var r = 0, i = 0;
    while (i < s.length) {
      var cur = val[s[i]], nxt = val[s[i+1]] || 0;
      r += cur < nxt ? nxt - cur : cur;
      i += cur < nxt ? 2 : 1;
    }
    return r;
  }
  for (var num = 1; num <= 40; num++) {
    var s = '';
    var n = num;
    var sym = [['X',10],['IX',9],['V',5],['IV',4],['I',1]];
    for (var j = 0; j < sym.length; j++) { while (n >= sym[j][1]) { s += sym[j][0]; n -= sym[j][1]; } }
    m[s] = num;
  }
  return m;
})();

function romanToArabic(text) {
  return text.replace(/\b[XIV]+\b/g, function (match) {
    return ROMAN_MAP[match] !== undefined ? String(ROMAN_MAP[match]) : match;
  });
}

function formatWeekTitle(text) {
  return text.replace(/ da Semana (\d+) do /g, ' - $1\u00B0 Semana do ');
}

function liturgicalDisplayTitle(liturgical) {
  if (!liturgical) return '';
  const { rank, season, celebrationTitle } = liturgical;
  if (rank === 'memoria' || rank === 'festa') {
    return formatWeekTitle(romanToArabic(season || celebrationTitle || ''));
  }
  return formatWeekTitle(romanToArabic(celebrationTitle || season || ''));
}

function collectText(value, bucket = []) {
  if (value == null) return bucket;
  if (typeof value === 'string' || typeof value === 'number') {
    bucket.push(String(value));
    return bucket;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, bucket));
    return bucket;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectText(item, bucket));
  }
  return bucket;
}

export function validateSelection(selection) {
  const errors = [];

  if (!selection || typeof selection !== 'object') {
    return { ok: false, errors: ['selection must be an object'] };
  }

  if (!selection.date || !/^\d{4}-\d{2}-\d{2}$/.test(selection.date)) {
    errors.push('date must use YYYY-MM-DD');
  }
  if (!selection.editionLabel) errors.push('editionLabel is required');
  if (selection.liturgical?.country && selection.liturgical.country !== 'BR') {
    errors.push('liturgical.country must be BR for the current edition rules');
  }
  if (selection.liturgical?.rank && !liturgicalRanks.has(selection.liturgical.rank)) {
    errors.push('liturgical.rank is not allowed');
  }
  if (['memoria', 'festa', 'solenidade'].includes(selection.liturgical?.rank) && !selection.liturgical?.celebrationTitle) {
    errors.push('liturgical.celebrationTitle is required for memoria, festa or solenidade');
  }
  if (!selection.liturgical?.season) errors.push('liturgical.season is required');
  if (!selection.liturgical?.cssColor || !/^#[0-9A-Fa-f]{6}$/.test(selection.liturgical.cssColor)) {
    errors.push('liturgical.cssColor must be a hex color');
  }
  if (!selection.liturgical?.gospelShort) errors.push('liturgical.gospelShort is required');
  if (!selection.saint?.name) errors.push('saint.name is required');
  if (!selection.saint?.description) errors.push('saint.description is required');
  if (!selection.gospel?.ref) errors.push('gospel.ref is required');
  if (!Array.isArray(selection.gospel?.lines) || selection.gospel.lines.length === 0) {
    errors.push('gospel.lines must contain at least one line');
  }

  const news = Array.isArray(selection.news) ? selection.news : [];
  if (news.length < 5) errors.push('at least 5 news items are required');
  if (news.length > 8) errors.push('at most 8 news items are allowed');

  const seenUrls = new Set();
  const sourceCounts = new Map();
  news.forEach((item, index) => {
    const label = `news[${index}]`;
    if (!allowedSourceKeys.has(sourceKey(item.source))) errors.push(`${label}.source is not allowed`);
    if (!item.title || item.title.length < 24) errors.push(`${label}.title is too short`);
    if (!item.summary || item.summary.length < 40) errors.push(`${label}.summary is too short`);
    if (!isHttpsUrl(item.url)) errors.push(`${label}.url must be an https URL`);
    if (isHttpsUrl(item.url) && !isArticleUrl(item.url)) errors.push(`${label}.url must be a clear article URL`);
    if (hasEditorialResidue(`${item.title} ${item.summary}`)) errors.push(`${label}.text contains editorial residue`);
    if (seenUrls.has(item.url)) errors.push(`${label}.url is duplicated`);
    if (looksLikeSaintContent(item, selection.saint)) errors.push(`${label}.saint content must stay in saint block`);
    seenUrls.add(item.url);
    sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);
  });

  if (sourceCounts.size < 3) errors.push('at least 3 different news sources are required');
  sourceCounts.forEach((count, source) => {
    if (count > 2) errors.push(`at most 2 news items per source are allowed: ${source}`);
  });
  if (sourceCount(news, vaticanSourceKeys) < 2) errors.push('at least 2 Vatican or official Church news items are required');
  if (sourceCount(news, brazilSourceKeys) < 1) errors.push('at least 1 Brazil/CNBB news item is required');
  if (sourceCount(news, trustedCatholicSourceKeys) < 2) errors.push('at least 2 trusted Catholic outlet news items are required');

  if (selection.sponsor?.enabled) {
    if (!selection.sponsor.label) errors.push('sponsor.label is required when sponsor is enabled');
    if (!selection.sponsor.text) errors.push('sponsor.text is required when sponsor is enabled');
    if (!isHttpsUrl(selection.sponsor.url)) errors.push('sponsor.url must be an https URL');
  }

  collectText(selection).forEach((text) => {
    const term = hasInternalTerm(text);
    if (term) errors.push(`internal term found: ${term}`);
  });

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function renderNews(news) {
  return news.map((item, index) => `
    <article class="news-item reveal">
      <div class="news-index">${String(index + 1).padStart(2, '0')}</div>
      <div class="news-body">
        <div class="news-source">${escapeHtml(item.source)}</div>
        <h3 class="news-headline">${escapeHtml(item.title)}</h3>
        <p class="news-summary">${escapeHtml(item.summary)}</p>
        <a class="btn-source" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
          Ler na fonte
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M1 9L9 1M9 1H3M9 1V7"/>
          </svg>
        </a>
      </div>
    </article>`).join('\n');
}

function renderSponsor(sponsor) {
  if (!sponsor?.enabled) return '';
  return `
  <aside class="sponsor-bar">
    <span class="sponsor-label">${escapeHtml(sponsor.label)}</span>
    <a href="${escapeHtml(sponsor.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sponsor.text)}</a>
  </aside>`;
}

function renderSaintMoreLink(saint) {
  if (!saint?.url) return '';
  return `
    <a class="saint-more-link" href="${escapeHtml(saint.url)}" target="_blank" rel="noopener noreferrer">
      Saiba mais na Canção Nova
      <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M1 9L9 1M9 1H3M9 1V7"/>
      </svg>
    </a>`;
}

function cleanGospelLine(line) {
  return line.replace(/^\d+\s*/g, '').replace(/([:;,\s])\d+\s*/g, '$1').replace(/^[-,;\s]+/, '').trim()
    .replace(/&[a-zA-Z]+;/g, function (m) {
      var e = { '&aacute;':'á','&eacute;':'é','&iacute;':'í','&oacute;':'ó','&uacute;':'ú','&atilde;':'ã','&otilde;':'õ','&ccedil;':'ç','&acirc;':'â','&ecirc;':'ê','&ocirc;':'ô','&uuml;':'ü','&Aacute;':'Á','&Eacute;':'É','&Iacute;':'Í','&Oacute;':'Ó','&Uacute;':'Ú','&Atilde;':'Ã','&Otilde;':'Õ','&Ccedil;':'Ç','&Acirc;':'Â','&Ecirc;':'Ê','&Ocirc;':'Ô','&Uuml;':'Ü','&nbsp;':' ','&amp;':'&','&quot;':'"',"&#039;":"'","&lt;":"<","&gt;":">" };
      return e[m] || m;
    });
}

function renderGospelLines(lines) {
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  const truncated = truncateAtWord(text, 250);
  return escapeHtml(truncated);
}

function renderGospelLink() {
  return `<a class="btn-source gospel-link" href="https://www.cnbb.org.br/liturgia-diaria/" target="_blank" rel="noopener noreferrer">
    Ler o Evangelho na CNBB
    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <path d="M1 9L9 1M9 1H3M9 1V7"/>
    </svg>
  </a>`;
}

function renderLiturgyHours(reading, url) {
  if (!reading) return '';
  const truncated = truncateAtWord(reading, 250);
  return `
  <div class="gospel-card">
    <div class="gospel-ref">Liturgia das Horas</div>
    <p class="gospel-text">${escapeHtml(truncated)}</p>
    <div class="gospel-link-wrapper">
      <a class="btn-source gospel-link" href="${escapeHtml(url || 'https://www.paulus.com.br/portal/liturgia-diaria-das-horas/')}" target="_blank" rel="noopener noreferrer">
        Ler a Liturgia das Horas na Paulus
        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M1 9L9 1M9 1H3M9 1V7"/>
        </svg>
      </a>
    </div>
  </div>`;
}

export function simplifyGospelRef(ref) {
  if (!ref) return '';
  const parens = ref.match(/\(([^)]+)\)/);
  if (parens) return parens[1].replace(/ ou mais breve.*$/, '').trim();
  const clean = ref.split(' - ')[0].trim();
  const match = clean.match(/^([A-Za-zçã]+)\s+([\d,;\s-]+)$/);
  if (match) {
    const abbr = { 'mateus':'Mt','marcos':'Mc','lucas':'Lc','joão':'Jo','atos':'At' };
    return (abbr[match[1].toLowerCase()] || match[1]) + ' ' + match[2];
  }
  return ref.replace(/ ou mais breve.*$/, '').trim();
}

export function truncateAtWord(text, maxLen) {
  if (!text || text.length <= maxLen) return text || '';
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.6) return truncated.slice(0, lastSpace) + '...';
  return truncated + '...';
}

function isLightColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 180;
}

export function loadTemplate(templatePath = path.join(rootDir, 'template', 'noticias-catolicas.template.html')) {
  return fs.readFileSync(templatePath, 'utf8');
}

function renderSaintSection(saint) {
  if (!saint?.name) return '';
  const link = renderSaintMoreLink(saint);
  return `
  <div class="section-header">
    <span class="section-header-title">Santo do Dia</span>
    <div class="section-header-line"></div>
  </div>
  <div class="saint-card">
    <h2 class="saint-name">${escapeHtml(saint.name)}</h2>
    <p class="saint-bio">${escapeHtml(saint.description ?? '')}</p>
${link}
  </div>`;
}

export function buildPage(selection, template = loadTemplate()) {
  const replacements = {
    '{{LITURGICAL_COLOR}}': selection.liturgical.cssColor,
    '{{LITURGICAL_TEXT_MODIFIER}}': isLightColor(selection.liturgical.cssColor) ? ' liturgy-light' : '',
    '{{EDITION_DATE}}': selection.date,
    '{{PAGE_TITLE}}': `Notícias Católicas - ${selection.editionLabel} - @ilustre.ai`,
    '{{HERO_EYEBROW}}': `Curadoria diária - ${selection.editionLabel}`,
    '{{LITURGICAL_SEASON}}': liturgicalDisplayTitle(selection.liturgical),
    '{{GOSPEL_SHORT}}': simplifyGospelRef(selection.liturgical.gospelShort ?? ''),
    '{{EDITION_LABEL}}': selection.editionLabel,
    '{{SAINT_SECTION}}': renderSaintSection(selection.saint),
    '{{GOSPEL_REF}}': simplifyGospelRef(selection.gospel.ref),
    '{{GOSPEL_LINES}}': renderGospelLines(selection.gospel.lines),
    '{{GOSPEL_LINK}}': renderGospelLink(selection),
    '{{LITURGY_HOURS}}': renderLiturgyHours(selection.liturgyHours?.reading, selection.liturgyHours?.url),
    '{{NEWS_ITEMS}}': renderNews(selection.news),
    '{{CLOSING_QUOTE_TEXT}}': escapeHtml(selection.closingQuote?.text ?? ''),
    '{{CLOSING_QUOTE_SOURCE}}': escapeHtml(selection.closingQuote?.source ?? ''),
    '{{SPONSOR_BAR}}': renderSponsor(selection.sponsor)
  };

  const html = Object.entries(replacements).reduce(
    (html, [token, value]) => html.replaceAll(token, value),
    template
  );

  const quoteText = escapeHtml(selection.closingQuote?.text ?? 'Tudo por amor, nada por força.');
  const quoteSource = escapeHtml(selection.closingQuote?.source ?? 'São Francisco de Sales');

  return html
    .replace(/(<p class="closing-quote-text">)([\s\S]*?)(<\/p>)/, `$1${quoteText}$3`)
    .replace(/(<p class="closing-quote-source">)([\s\S]*?)(<\/p>)/, `$1${quoteSource}$3`);
}

export function validateRenderedHtml(html, selection) {
  const errors = [];

  if (!html.includes('<!DOCTYPE html>')) errors.push('missing doctype');
  if (!html.includes(selection.editionLabel)) errors.push('missing edition label');
  if (!html.includes(selection.liturgical.cssColor)) errors.push('missing liturgical color');
  if (!html.includes(liturgicalDisplayTitle(selection.liturgical))) errors.push('missing liturgical display title');
  if (selection.saint?.name && !html.includes(selection.saint.name)) errors.push('missing saint name');
  if (!html.includes(simplifyGospelRef(selection.gospel.ref))) errors.push('missing gospel ref');
  if (selection.closingQuote?.text && !html.includes(selection.closingQuote.text)) errors.push('missing closing quote text');
  if (selection.closingQuote?.source && !html.includes(selection.closingQuote.source)) errors.push('missing closing quote source');
  if (!html.includes('class="hero-title"')) errors.push('missing hero title');
  const renderedNewsCount = (html.match(/class="news-item/g) ?? []).length;
  if (renderedNewsCount < 5) errors.push('missing news items');
  if (Array.isArray(selection.news) && renderedNewsCount !== selection.news.length) {
    errors.push('rendered news item count mismatch');
  }
  if (html.includes('{{')) errors.push('unresolved template token');

  const scriptTags = html.match(/<script[\s\S]*?<\/script>/gi) ?? [];
  if (scriptTags.length > 1) {
    errors.push('at most one inline script is allowed in the generated static page');
  }

  internalTerms.forEach((term) => {
    if (normalizeText(html).includes(normalizeText(term))) errors.push(`internal term found: ${term}`);
  });

  const externalLinks = [...html.matchAll(/<a\b[^>]*href="https:\/\/[^"]+"[^>]*>/g)];
  externalLinks.forEach(([tag]) => {
    if (!/target="_blank"/.test(tag)) errors.push('external link missing target');
    if (!/rel="noopener noreferrer"/.test(tag)) errors.push('external link missing rel');
  });

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeFileEnsured(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}
