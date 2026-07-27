import { readJson, buildPage, validateRenderedHtml } from './scripts/lib.mjs';

const sel = readJson('C:/Users/Cliente/AppData/Local/Temp/opencode/noticias-catolicas-tmp/data/daily-selection.json');
const html = buildPage(sel);
const result = validateRenderedHtml(html, sel);
console.log('Validation OK:', result.ok);
if (!result.ok) result.errors.forEach(e => console.log('VALIDATION ERROR:', e));

// Show news items
const feedIdx = html.indexOf('class="news-feed"');
if (feedIdx >= 0) {
  const feedEnd = html.indexOf('closing-quote', feedIdx);
  const feedSection = html.substring(feedIdx, feedEnd > 0 ? feedEnd : feedIdx + 3000);
  // Print news-item related parts
  const items = feedSection.match(/news-item[\s\S]*?<\/article>/g);
  if (items) {
    console.log('NEWS ITEMS FOUND:', items.length);
    items.forEach((item, i) => {
      const titleMatch = item.match(/news-headline">([^<]+)/);
      const linkMatch = item.match(/href="([^"]+)"/);
      console.log(`  ${i+1}. title: ${titleMatch ? titleMatch[1] : 'N/A'}`);
      console.log(`     link: ${linkMatch ? linkMatch[1] : 'N/A'}`);
      // Check for broken parts
      if (item.includes('undefined')) console.log(`     WARNING: contains 'undefined'`);
      if (item.includes('null')) console.log(`     WARNING: contains 'null'`);
      if (item.includes('[object')) console.log(`     WARNING: contains '[object'`);
    });
  } else {
    console.log('No news-item articles found in feed section');
    console.log('FEED SECTION START:', feedSection.substring(0, 500));
  }
} else {
  console.log('No news-feed found');
  // Find news section anyway
  const newsIdx = html.indexOf('news-item');
  if (newsIdx >= 0) {
    console.log('news-item found outside news-feed:', html.substring(newsIdx, newsIdx + 300));
  }
}
