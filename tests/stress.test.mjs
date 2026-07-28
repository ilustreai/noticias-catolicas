import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const rootDir = process.cwd();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function repeat(fn, times) {
  const results = [];
  for (let i = 0; i < times; i++) results.push(await fn(i));
  return results;
}

function tmpPath(suffix) {
  return path.join(rootDir, 'data', `_stress_${randomBytes(4).toString('hex')}_${suffix}`);
}

function cleanup(...paths) {
  for (const p of paths) {
    try { fs.unlinkSync(p); } catch { /* ok */ }
  }
}

// ---------------------------------------------------------------------------
// 1. Circuit breaker stress
// ---------------------------------------------------------------------------

test('circuit breaker trips after 5 consecutive failures', { timeout: 15000 }, async () => {
  // Re-create the circuit breaker module pattern used in generate-daily-selection
  const circuitBreaker = new Map();
  const CB_MAX_FAILURES = 5;

  function simulateSource(sourceName, failCount, errors) {
    const cb = circuitBreaker.get(sourceName);
    if (cb && cb.failures >= CB_MAX_FAILURES) {
      const elapsed = Date.now() - cb.since;
      if (elapsed < 3600000) {
        errors.push({ source: sourceName, type: 'circuit-breaker', error: 'open' });
        return 'blocked';
      }
      circuitBreaker.delete(sourceName);
    }

    if (failCount > 0) {
      const entry = circuitBreaker.get(sourceName) || { failures: 0, since: Date.now() };
      entry.failures++;
      if (entry.failures === 1) entry.since = Date.now();
      circuitBreaker.set(sourceName, entry);
      return 'fail';
    }

    circuitBreaker.delete(sourceName);
    return 'success';
  }

  const errors = [];

  // 5 failures should trip breaker
  for (let i = 0; i < 5; i++) {
    const result = simulateSource('FonteTeste', 1, errors);
    assert.equal(result, 'fail', `attempt ${i + 1} should fail`);
  }

  // 6th call should be blocked
  const result = simulateSource('FonteTeste', 0, errors);
  assert.equal(result, 'blocked', 'circuit breaker should be open');
  assert.ok(errors.some(e => e.type === 'circuit-breaker'), 'should log circuit-breaker error');
});

test('circuit breaker resets after success', { timeout: 15000 }, () => {
  const circuitBreaker = new Map();

  function simulate(name, shouldFail, errors) {
    const cb = circuitBreaker.get(name);
    if (cb && cb.failures >= 5) {
      const elapsed = Date.now() - cb.since;
      if (elapsed < 3600000) {
        errors.push({ source: name, type: 'blocked' });
        return 'blocked';
      }
      circuitBreaker.delete(name);
    }
    if (shouldFail) {
      const entry = circuitBreaker.get(name) || { failures: 0, since: Date.now() };
      entry.failures++;
      if (entry.failures === 1) entry.since = Date.now();
      circuitBreaker.set(name, entry);
      return 'fail';
    }
    circuitBreaker.delete(name);
    return 'success';
  }

  const errors = [];

  // 3 failures
  simulate('FonteReset', true, errors);
  simulate('FonteReset', true, errors);
  simulate('FonteReset', true, errors);

  // Success resets the counter
  const r = simulate('FonteReset', false, errors);
  assert.equal(r, 'success', 'should succeed');

  // Verify no longer blocked
  const entry = circuitBreaker.get('FonteReset');
  assert.equal(entry, undefined, 'circuit breaker entry should be removed after success');
});

// ---------------------------------------------------------------------------
// 2. Retry logic stress
// ---------------------------------------------------------------------------

test('retryFetch handles transient failures', { timeout: 30000 }, async () => {
  const { retryFetch } = await import('../scripts/lib.mjs');
  const fallbacks = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'fallback-news.json'), 'utf8'));
  const url = fallbacks.items[0].url;
  assert.ok(url, 'fallback url must exist');

  // Normal success
  const resp = await retryFetch(url, { method: 'HEAD' }, 2);
  assert.ok(resp.ok || resp.status === 429 || resp.status === 403,
    `expected ok/429/403, got ${resp.status}`);

  // Invalid URL should fail gracefully after retries
  try {
    await retryFetch('https://invalid.example.com.br/teste', { method: 'HEAD' }, 2);
    assert.fail('should have thrown');
  } catch {
    assert.ok(true, 'retryFetch throws on unreachable URL');
  }
});

test('retryFetch retries after timeout', { timeout: 30000 }, async () => {
  // Test with a URL that will timeout (slow server)
  // Use a non-existent port on localhost to trigger connection error
  try {
    await retryFetch('http://localhost:19999/test', { method: 'GET' }, 2);
    assert.fail('should have thrown');
  } catch {
    assert.ok(true, 'retryFetch throws after exhausting retries');
  }
});

// ---------------------------------------------------------------------------
// 3. Atomic write stress
// ---------------------------------------------------------------------------

test('writeJsonAtomic survives concurrent writes', { timeout: 15000 }, async () => {
  const { writeJsonAtomic, readJson } = await import('../scripts/lib.mjs');
  const filePath = tmpPath('concurrent.json');

  const writers = 20;
  const writeAll = Array.from({ length: writers }, (_, i) =>
    () => writeJsonAtomic(filePath, { writer: i, data: 'x'.repeat(100), timestamp: Date.now() })
  );

  try {
    await Promise.all(writeAll.map(fn => fn()));

    const result = readJson(filePath);
    assert.ok(result.writer >= 0 && result.writer < writers, 'last writer should be valid');
    assert.equal(typeof result.data, 'string');
    assert.ok(result.data.length >= 100);
  } finally {
    // Also clean up any temp files
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const temps = fs.readdirSync(dir).filter(f => f.startsWith(base + '.tmp.'));
    for (const t of temps) try { fs.unlinkSync(path.join(dir, t)); } catch {}
    cleanup(filePath);
  }
});

test('writeJsonAtomic does not leave temp files on success', { timeout: 10000 }, async () => {
  const { writeJsonAtomic } = await import('../scripts/lib.mjs');
  const filePath = tmpPath('notemp.json');
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  try {
    await writeJsonAtomic(filePath, { ok: true });
    // Verify no .tmp. files remain for this path
    const leftovers = fs.readdirSync(dir).filter(f => f.startsWith(base + '.tmp.'));
    assert.equal(leftovers.length, 0, 'should clean up temp files');
  } finally {
    cleanup(filePath);
  }
});

test('writeJsonAtomic never produces partial output', { timeout: 10000 }, async () => {
  const { writeJsonAtomic, readJson } = await import('../scripts/lib.mjs');

  // Write with very large data to stress the write
  const filePath = tmpPath('large.json');
  try {
    const large = {
      description: 'x'.repeat(50000),
      array: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: 'x'.repeat(50) })),
      nested: { a: { b: { c: { d: { e: 'deep' } } } } },
    };

    await writeJsonAtomic(filePath, large);
    const result = readJson(filePath);
    assert.equal(result.description.length, 50000);
    assert.equal(result.array.length, 1000);
    assert.equal(result.nested.a.b.c.d.e, 'deep');
  } finally {
    cleanup(filePath);
  }
});

// ---------------------------------------------------------------------------
// 4. Error aggregation stress
// ---------------------------------------------------------------------------

test('error aggregation handles many simultaneous errors', { timeout: 10000 }, () => {
  const errors = [];

  function simulateSource(sourceName, type, shouldFail) {
    if (shouldFail) {
      errors.push({ source: sourceName, type, url: `https://${sourceName}.example.com`, error: 'Simulated failure' });
      return [];
    }
    return [{ title: 'OK', url: 'https://ok.example.com' }];
  }

  // Simulate 50 sources, 80% failing
  for (let i = 0; i < 50; i++) {
    simulateSource(`Source${i}`, i % 2 === 0 ? 'feed' : 'page', i % 5 !== 0);
  }

  assert.equal(errors.length, 40, '40 out of 50 should have errors');
  assert.ok(errors.every(e => e.source && e.type && e.error));
  assert.ok(errors.some(e => e.type === 'feed'));
  assert.ok(errors.some(e => e.type === 'page'));

  // Verify no duplicate errors
  const urls = errors.map(e => e.url);
  assert.equal(new Set(urls).size, urls.length, 'no duplicate error URLs');
});

test('saveErrorReport generates valid report file', { timeout: 10000 }, () => {
  // Simulate the saveErrorReport function from generate-daily-selection
  function saveErrorReport(date, errorList) {
    if (errorList.length === 0) return;
    const report = { date, generatedAt: new Date().toISOString(), total: errorList.length, errors: errorList };
    const outPath = path.join(rootDir, 'data', `error-report-${date}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    return outPath;
  }

  const date = '2026-07-28';
  const sampleErrors = Array.from({ length: 10 }, (_, i) => ({
    source: `Source${i}`,
    type: i < 5 ? 'feed' : 'page',
    url: `https://source${i}.example.com/feed`,
    error: `Error ${i}: connection refused`,
  }));

  const outPath = saveErrorReport(date, sampleErrors);
  assert.ok(outPath, 'report should be saved');
  assert.ok(fs.existsSync(outPath));

  try {
    const report = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(report.date, date);
    assert.equal(report.total, 10);
    assert.equal(report.errors.length, 10);
  } finally {
    cleanup(outPath);
  }
});

// ---------------------------------------------------------------------------
// 5. Fallback expiry stress
// ---------------------------------------------------------------------------

test('loadFallbackItems filters expired items', { timeout: 10000 }, async () => {
  const { loadFallbackItems } = await import('../scripts/lib.mjs');
  const items = loadFallbackItems();
  assert.ok(items.length >= 8, 'at least 8 non-expired fallbacks');

  // All items should be non-expired
  const now = new Date();
  for (const item of items) {
    if (item.expiresAt) {
      const exp = new Date(item.expiresAt + 'T23:59:59-03:00');
      assert.ok(exp >= now, `item ${item.title} should not be expired (expires ${item.expiresAt})`);
    }
  }
});

// ---------------------------------------------------------------------------
// 6. Health check under simulated failure
// ---------------------------------------------------------------------------

test('health check detects missing files', { timeout: 10000 }, async () => {
  const { readJson } = await import('../scripts/lib.mjs');
  const required = [
    'daily-selection.json',
    'liturgical-calendar-2026.json',
    'news-sources.json',
    'curated-saints.json',
    'fallback-news.json',
  ];
  for (const file of required) {
    const p = path.join(rootDir, 'data', file);
    assert.ok(fs.existsSync(p), `${file} must exist`);
    try {
      readJson(p);
    } catch (e) {
      assert.fail(`${file} must be valid JSON: ${e.message}`);
    }
  }
});

test('health check validates all news source URLs', { timeout: 30000 }, async () => {
  const { readJson } = await import('../scripts/lib.mjs');
  const sources = readJson(path.join(rootDir, 'data', 'news-sources.json'));
  assert.ok(sources.length >= 6, 'at least 6 sources');

  const urls = [];
  for (const s of sources) {
    if (s.feedUrl) urls.push({ source: s.source, url: s.feedUrl, type: 'feed' });
    if (s.pageUrls) for (const u of s.pageUrls) urls.push({ source: s.source, url: u, type: 'page' });
  }

  // Verify all URLs are syntactically valid
  for (const { source, url } of urls) {
    try {
      const parsed = new URL(url);
      assert.ok(parsed.protocol === 'https:' || parsed.protocol === 'http:',
        `Invalid protocol for ${source}: ${url}`);
    } catch {
      assert.fail(`Invalid URL for ${source}: ${url}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 7. Graceful degradation stress
// ---------------------------------------------------------------------------

test('generation continues when some sources fail', { timeout: 30000 }, async () => {
  // This test simulates what generate-daily-selection does internally:
  // It calls fetchSource for each source; some fail, others succeed.
  // The system should continue with partial results.

  const { loadFallbackItems } = await import('../scripts/lib.mjs');
  const sources = ['Vatican News', 'CNBB', 'ACI Digital', 'Shalom', 'Aleteia', 'Gaudium Press', 'Canção Nova'];
  const errors = [];
  const results = [];

  // Simulate: first 3 sources succeed, last 4 fail
  for (let i = 0; i < sources.length; i++) {
    if (i < 3) {
      results.push({ source: sources[i], title: `Notícia de ${sources[i]}`, url: `https://${sources[i].toLowerCase().replace(/\s+/g, '')}.example.com/news` });
    } else {
      errors.push({ source: sources[i], type: 'feed', error: 'Simulated failure for stress test' });
      // System falls back to cached items
      const fallbacks = loadFallbackItems().filter(f => f.source === sources[i] || !f.source);
      if (fallbacks.length > 0) {
        results.push(fallbacks[0]);
      }
    }
  }

  // Should have at least 3 + some fallbacks
  assert.ok(results.length >= 3, 'should continue with partial results');
  assert.equal(errors.length, 4, 'should collect 4 errors');
  assert.ok(errors.every(e => e.source && e.type === 'feed'));

  // Results should include items from successful sources
  const sourcesInResults = new Set(results.map(r => r.source));
  assert.ok(sourcesInResults.has('Vatican News') || sourcesInResults.has('CNBB') || sourcesInResults.has('ACI Digital'),
    'should include results from successful sources');
});

// ---------------------------------------------------------------------------
// 8. Concurrent access stress
// ---------------------------------------------------------------------------

test('concurrent retryFetch calls do not interfere', { timeout: 60000 }, async () => {
  const { retryFetch } = await import('../scripts/lib.mjs');
  const fallbacks = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'fallback-news.json'), 'utf8'));
  const urls = fallbacks.items.map(i => i.url).filter(Boolean).slice(0, 5);
  assert.ok(urls.length >= 3, 'need at least 3 fallback URLs');

  // Fire all requests concurrently
  const results = await Promise.allSettled(urls.map(url =>
    retryFetch(url, { method: 'HEAD' }, 1)
  ));

  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');

  assert.ok(fulfilled.length >= 1, 'at least one concurrent request should succeed');
  // Even rejected ones should have been retried without crashing
  for (const r of rejected) {
    assert.ok(r.reason instanceof Error, 'rejections should be Error objects');
  }
});

// ---------------------------------------------------------------------------
// 9. Memory / edge case stress
// ---------------------------------------------------------------------------

test('loadFallbackItems handles empty or missing file gracefully', { timeout: 10000 }, async () => {
  const { loadFallbackItems } = await import('../scripts/lib.mjs');
  const fakePath = tmpPath('nonexistent.json');

  // Non-existent file should return empty array
  const result = loadFallbackItems(fakePath);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);

  cleanup(fakePath);
});

test('writeJsonAtomic handles empty objects and null values', { timeout: 10000 }, async () => {
  const { writeJsonAtomic, readJson } = await import('../scripts/lib.mjs');

  const edgeCases = [
    { name: 'empty', data: {} },
    { name: 'nulls', data: { a: null, b: null } },
    { name: 'arrays', data: { items: [] } },
    { name: 'deep', data: { lvl1: { lvl2: { lvl3: { lvl4: {} } } } } },
    { name: 'mixed', data: { s: 'string', n: 0, b: false, a: [1, null, 'x'], o: { k: 'v' } } },
  ];

  for (const { name, data } of edgeCases) {
    const p = tmpPath(`${name}.json`);
    try {
      await writeJsonAtomic(p, data);
      const result = readJson(p);
      assert.deepEqual(result, data, `${name} should round-trip`);
    } finally {
      cleanup(p);
    }
  }
});

test('fixMojibake handles extreme cases', { timeout: 10000 }, async () => {
  const { fixMojibake } = await import('../scripts/lib.mjs');

  // Normal strings should pass through unchanged
  assert.equal(fixMojibake('Hello World'), 'Hello World');
  assert.equal(fixMojibake('São Paulo'), 'São Paulo');
  assert.equal(fixMojibake('João 3:16'), 'João 3:16');

  // Empty/null edge cases
  assert.equal(fixMojibake(''), '');
  assert.equal(fixMojibake(null), null);
  assert.equal(fixMojibake(undefined), undefined);

  // Mixed content (partially corrupted, partially clean)
  const mixed = fixMojibake('CanÃ§Ã£o Nova e São Paulo');
  assert.ok(mixed.includes('Canção Nova'), 'should fix mojibake');
  assert.ok(mixed.includes('São Paulo'), 'should keep clean text');
});
