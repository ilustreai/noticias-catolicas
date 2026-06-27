import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export const internalTerms = [
  'teste manual',
  'confianca',
  'confiança',
  'revalidar',
  'nao confirmado',
  'não confirmado',
  'alerta interno',
  'operador',
  'bastidor'
];

const allowedSources = new Set([
  'Vatican News',
  'Santa Sé',
  'Santa Se',
  'Vaticano',
  'CNBB',
  'ACI Digital'
]);

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function hasInternalTerm(value) {
  const text = String(value ?? '').toLowerCase();
  return internalTerms.find((term) => text.includes(term));
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
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
  news.forEach((item, index) => {
    const label = `news[${index}]`;
    if (!allowedSources.has(item.source)) errors.push(`${label}.source is not allowed`);
    if (!item.title || item.title.length < 24) errors.push(`${label}.title is too short`);
    if (!item.summary || item.summary.length < 40) errors.push(`${label}.summary is too short`);
    if (!isHttpsUrl(item.url)) errors.push(`${label}.url must be an https URL`);
    if (seenUrls.has(item.url)) errors.push(`${label}.url is duplicated`);
    seenUrls.add(item.url);
  });

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

function renderGospelLines(lines) {
  return lines
    .map((line) => `<span class="gospel-line">${escapeHtml(line)}</span>`)
    .join('\n      ');
}

export function loadTemplate(templatePath = path.join(rootDir, 'template', 'noticias-catolicas.template.html')) {
  return fs.readFileSync(templatePath, 'utf8');
}

export function buildPage(selection, template = loadTemplate()) {
  const replacements = {
    '{{LITURGICAL_COLOR}}': selection.liturgical.cssColor,
    '{{PAGE_TITLE}}': `Notícias Católicas - ${selection.editionLabel} - @ilustre.ai`,
    '{{HERO_EYEBROW}}': `Curadoria diária - ${selection.editionLabel}`,
    '{{LITURGICAL_SEASON}}': selection.liturgical.season,
    '{{GOSPEL_SHORT}}': selection.liturgical.gospelShort,
    '{{EDITION_LABEL}}': selection.editionLabel,
    '{{SAINT_FEAST}}': selection.saint.feast,
    '{{SAINT_NAME}}': selection.saint.name,
    '{{SAINT_DESCRIPTION}}': selection.saint.description,
    '{{GOSPEL_REF}}': selection.gospel.ref,
    '{{GOSPEL_LINES}}': renderGospelLines(selection.gospel.lines),
    '{{NEWS_ITEMS}}': renderNews(selection.news),
    '{{SPONSOR_BAR}}': renderSponsor(selection.sponsor)
  };

  return Object.entries(replacements).reduce(
    (html, [token, value]) => html.replaceAll(token, value),
    template
  );
}

export function validateRenderedHtml(html, selection) {
  const errors = [];

  if (!html.includes('<!DOCTYPE html>')) errors.push('missing doctype');
  if (!html.includes(selection.editionLabel)) errors.push('missing edition label');
  if (!html.includes(selection.liturgical.cssColor)) errors.push('missing liturgical color');
  if (!html.includes(selection.saint.name)) errors.push('missing saint name');
  if (!html.includes(selection.gospel.ref)) errors.push('missing gospel ref');
  if ((html.match(/class="news-item/g) ?? []).length < 5) errors.push('missing news items');
  if (html.includes('{{')) errors.push('unresolved template token');
  if (/<script/i.test(html)) errors.push('inline script is not allowed in the generated static page');

  internalTerms.forEach((term) => {
    if (html.toLowerCase().includes(term)) errors.push(`internal term found: ${term}`);
  });

  const externalLinks = [...html.matchAll(/<a\b[^>]*href="https:\/\/[^\"]+"[^>]*>/g)];
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
