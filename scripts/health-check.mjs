import fs from 'node:fs';
import path from 'node:path';
import { readJson, loadFallbackItems, retryFetch } from './lib.mjs';

const rootDir = process.cwd();
const dataDir = path.join(rootDir, 'data');

function section(title) {
  console.log(`\n## ${title}`);
}

function ok(msg) {
  console.log(`  OK  ${msg}`);
}

function fail(msg) {
  console.log(`  FAIL  ${msg}`);
}

function warn(msg) {
  console.log(`  WARN  ${msg}`);
}

async function main() {
  console.log('=== Health Check ===\n');
  let allOk = true;

  // 1. Data files
  section('Data files');
  const required = [
    'daily-selection.json',
    'liturgical-calendar-2026.json',
    'news-sources.json',
    'curated-saints.json',
    'fallback-news.json',
  ];
  for (const file of required) {
    const p = path.join(dataDir, file);
    if (fs.existsSync(p)) {
      try {
        readJson(p);
        ok(`${file} (valid JSON)`);
      } catch (e) {
        fail(`${file} (invalid JSON: ${e.message})`);
        allOk = false;
      }
    } else {
      fail(`${file} (missing)`);
      allOk = false;
    }
  }

  // 2. Liturgical calendar
  section('Liturgical calendar');
  try {
    const cal = readJson(path.join(dataDir, 'liturgical-calendar-2026.json'));
    const entries = Object.keys(cal.entries || {});
    ok(`${entries.length} entries`);
    if (entries.length < 100) {
      warn(`Only ${entries.length} entries, expected ~365`);
    }
  } catch (e) {
    fail(`Error: ${e.message}`);
    allOk = false;
  }

  // 3. Fallback items
  section('Fallback items');
  const fallbacks = loadFallbackItems();
  ok(`${fallbacks.length} non-expired items`);
  if (fallbacks.length < 8) {
    warn(`Only ${fallbacks.length} fallbacks; may be insufficient`);
  }
  const expired = fallbacks.filter(f => f.expiresAt && new Date(f.expiresAt) < new Date());
  if (expired.length > 0) {
    warn(`${expired.length} expired items (should have been filtered)`);
  }

  // 4. News sources
  section('News sources');
  try {
    const sources = readJson(path.join(dataDir, 'news-sources.json'));
    ok(`${sources.length} sources configured`);
    const withFeed = sources.filter(s => s.feedUrl).length;
    const withPage = sources.filter(s => s.pageUrls?.length).length;
    ok(`${withFeed} with feed URLs, ${withPage} with page URLs`);
    for (const s of sources) {
      if (s.feedUrl) {
        try {
          new URL(s.feedUrl);
        } catch {
          fail(`Invalid feed URL for ${s.source}: ${s.feedUrl}`);
          allOk = false;
        }
      }
      if (s.pageUrls) {
        for (const u of s.pageUrls) {
          try { new URL(u); } catch {
            fail(`Invalid page URL for ${s.source}: ${u}`);
            allOk = false;
          }
        }
      }
    }
  } catch (e) {
    fail(`Error: ${e.message}`);
    allOk = false;
  }

  // 5. Source reachability (HEAD only)
  section('Source reachability');
  const sources = readJson(path.join(dataDir, 'news-sources.json'));
  const urlsToCheck = [];
  for (const s of sources) {
    if (s.feedUrl) urlsToCheck.push({ source: s.source, url: s.feedUrl, type: 'feed' });
    if (s.pageUrls) for (const u of s.pageUrls) urlsToCheck.push({ source: s.source, url: u, type: 'page' });
  }
  const results = await Promise.all(urlsToCheck.map(async ({ source, url, type }) => {
    try {
      const resp = await retryFetch(url, { method: 'HEAD' }, 1);
      return { source, url, type, ok: resp.ok, status: resp.status };
    } catch {
      return { source, url, type, ok: false, status: 0 };
    }
  }));
  const dead = results.filter(r => !r.ok && r.status !== 429 && r.status !== 403);
  const rateLimited = results.filter(r => r.status === 429 || r.status === 403);
  ok(`${results.length - dead.length - rateLimited.length} reachable, ${rateLimited.length} rate-limited, ${dead.length} unreachable`);
  for (const r of rateLimited) {
    warn(`${r.status} ${r.source} ${r.url}`);
  }
  for (const r of dead) {
    fail(`${r.status || 'ERR'} ${r.source} ${r.url}`);
    allOk = false;
  }

  // 6. TG Bot Worker
  section('Telegram bot worker');
  const workerFile = path.join(rootDir, 'workers', 'telegram-control', 'index.mjs');
  if (fs.existsSync(workerFile)) {
    ok(`worker file exists (${(fs.statSync(workerFile).size / 1024).toFixed(1)} KB)`);
  } else {
    fail('worker file missing');
    allOk = false;
  }

  // 7. Template
  section('Template');
  const templateFile = path.join(rootDir, 'template', 'noticias-catolicas.template.html');
  if (fs.existsSync(templateFile)) {
    const tmpl = fs.readFileSync(templateFile, 'utf8');
    const tokens = tmpl.match(/{{[^}]+}}/g) || [];
    ok(`template exists with ${tokens.length} tokens`);
  } else {
    fail('template file missing');
    allOk = false;
  }

  // 8. Latest selection
  section('Latest selection');
  try {
    const sel = readJson(path.join(dataDir, 'daily-selection.json'));
    ok(`Date: ${sel.date}, ${sel.news?.length || 0} news items`);
    if (!sel.date) { fail('No date in selection'); allOk = false; }
    if (!sel.news || sel.news.length < 5) { fail(`Only ${sel.news?.length || 0} news items`); allOk = false; }
    if (!sel.gospel?.ref) { fail('No gospel ref'); allOk = false; }
  } catch (e) {
    warn(`Could not read latest selection: ${e.message}`);
  }

  // Summary
  console.log(`\n---`);
  if (allOk) {
    console.log('RESULT: ALL CHECKS PASSED');
    process.exit(0);
  } else {
    console.log('RESULT: SOME CHECKS FAILED');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Health check crashed:', err);
  process.exit(1);
});
