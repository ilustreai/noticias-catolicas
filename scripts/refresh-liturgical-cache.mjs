import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const calendarPath = path.join(rootDir, 'data', 'liturgical-calendar-2026.json');

const ICS_URL = 'https://gcatholic.org/calendar/ics/2026-pt-General-G.ics?v=3';
const CN_LITURGY = 'https://liturgia.cancaonova.com/pb/liturgia/';
const CN_SAINTS = 'https://santo.cancaonova.com/';

const COLOR_MAP = {
  '⚪': { colorName: 'branco', cssColor: '#FFFFFF' },
  '🟢': { colorName: 'verde', cssColor: '#2E7D32' },
  '🔴': { colorName: 'vermelho', cssColor: '#C62828' },
  '🟣': { colorName: 'roxo', cssColor: '#7B2D26' },
};

const RANK_MAP = { S: 'solenidade', F: 'festa', M: 'memoria', m: 'memoria', 'm*': 'memoria' };

// Brazilian proper celebrations missing from General-G calendar
const BR_OVERRIDES = {
  '10-12': { celebration: 'Nossa Senhora Aparecida, Padroeira do Brasil', rank: 'solenidade', colorName: 'branco', cssColor: '#FFFFFF', season: 'Tempo Comum' },
  // Add other Brazilian propers here as needed
};

// Quotes by liturgical season — diverse per season, no sequential cycle
const QUOTES_BY_SEASON = {
  'Tempo Comum': [
    { text: 'Tudo por amor, nada por força.', source: 'São Francisco de Sales' },
    { text: 'A medida do amor é amar sem medida.', source: 'Santo Agostinho' },
    { text: 'O essencial não é fazer grandes coisas, mas pequenas coisas com grande amor.', source: 'Santa Teresa de Calcutá' },
    { text: 'A humildade é a base de todas as virtudes.', source: 'Santa Terezinha do Menino Jesus' },
    { text: 'A fé começa onde termina o orgulho.', source: 'Santo Agostinho' },
    { text: 'Nada te perturbe, nada te amedronte.', source: 'Santa Teresa d\'Ávila' },
    { text: 'Tudo posso naquele que me fortalece.', source: 'São Paulo Apóstolo' },
    { text: 'A oração é a respiração da alma.', source: 'São João Crisóstomo' },
    { text: 'Deus nos ama a todos como se fôssemos um só.', source: 'Santo Agostinho' },
    { text: 'Não há santo sem passado, nem pecador sem futuro.', source: 'Santo Agostinho' },
    { text: 'O que importa não é o que se dá, mas o amor com que se dá.', source: 'Santa Teresa de Calcutá' },
    { text: 'Fazei tudo por amor.', source: 'São Francisco de Sales' },
    { text: 'A alegria de servir é a alegria dos santos.', source: 'Santa Teresa de Calcutá' },
    { text: 'Deus escreve direito por linhas tortas.', source: 'Provérbio Popular' },
    { text: 'Quem ama a Deus, tudo pode.', source: 'São Filipe Néri' },
  ],
  'Quaresma': [
    { text: 'Convertei-vos e crede no Evangelho.', source: 'Liturgia das Cinzas' },
    { text: 'A paciência tudo alcança.', source: 'Santa Teresa d\'Ávila' },
    { text: 'Senhor, fazei de mim um instrumento de vossa paz.', source: 'São Francisco de Assis' },
    { text: 'O amor de Cristo nos impulsiona.', source: 'São Paulo Apóstolo' },
    { text: 'A alegria do Senhor é a nossa força.', source: 'São Paulo Apóstolo' },
    { text: 'Não de pão só vive o homem, mas de toda palavra que sai da boca de Deus.', source: 'Mt 4,4' },
    { text: 'Vigiai e orai, para não cairdes em tentação.', source: 'Mt 26,41' },
    { text: 'Arrependei-vos e cada um de vós seja batizado em nome de Jesus Cristo.', source: 'At 2,38' },
    { text: 'Sede misericordiosos como o vosso Pai é misericordioso.', source: 'Lc 6,36' },
    { text: 'A perfeita alegria está em carregar a cruz por amor de Cristo.', source: 'São Francisco de Assis' },
  ],
  'Advento': [
    { text: 'Vinde, Senhor, não tardeis.', source: 'Liturgia do Advento' },
    { text: 'Preparai o caminho do Senhor, endireitai as suas veredas.', source: 'Mc 1,3' },
    { text: 'Maria guardava todas estas coisas, meditando-as no seu coração.', source: 'Lc 2,19' },
    { text: 'Vigiai, pois, porque não sabeis em que dia virá o vosso Senhor.', source: 'Mt 24,42' },
    { text: 'O Senhor está perto; não vos inquieteis com nada.', source: 'Fl 4,5-6' },
    { text: 'Alegrai-vos sempre no Senhor; de novo digo: alegrai-vos.', source: 'Fl 4,4' },
    { text: 'Eis que estou à porta e bato; se alguém ouvir a minha voz e abrir a porta, entrarei em sua casa.', source: 'Ap 3,20' },
  ],
  'Tempo do Natal': [
    { text: 'O Verbo se fez carne e habitou entre nós.', source: 'Jo 1,14' },
    { text: 'Hoje nasceu para vós um Salvador, que é Cristo, o Senhor.', source: 'Lc 2,11' },
    { text: 'Glória a Deus nas alturas e paz na terra aos homens por Ele amados.', source: 'Lc 2,14' },
    { text: 'O povo que andava nas trevas viu uma grande luz.', source: 'Is 9,2' },
    { text: 'A luz brilha nas trevas, e as trevas não a venceram.', source: 'Jo 1,5' },
    { text: 'Maria conservava todas estas coisas, meditando-as no seu coração.', source: 'Lc 2,19' },
  ],
  'Tempo Pascal': [
    { text: 'Cristo ressuscitou! Aleluia!', source: 'Liturgia Pascal' },
    { text: 'A alegria do Senhor é a nossa força.', source: 'São Paulo Apóstolo' },
    { text: 'Ele não está aqui; ressuscitou como havia dito.', source: 'Mt 28,6' },
    { text: 'A morte foi vencida pela vida.', source: 'Liturgia Pascal' },
    { text: 'Se Cristo não ressuscitou, é vã a nossa pregação e vã a vossa fé.', source: '1Cor 15,14' },
    { text: 'O amor de Cristo nos impulsiona.', source: 'São Paulo Apóstolo' },
    { text: 'Tudo posso naquele que me fortalece.', source: 'São Paulo Apóstolo' },
    { text: 'A fé é a certeza daquilo que se espera, a convicção de fatos que não se veem.', source: 'Hb 11,1' },
  ],
};

// Known saint-specific quotes (used when saint matches exactly)
const SAINT_QUOTES = [
  { match: 'Francisco de Assis', text: 'Senhor, fazei de mim um instrumento de vossa paz.', source: 'São Francisco de Assis' },
  { match: 'Francisco de Sales', text: 'Tudo por amor, nada por força.', source: 'São Francisco de Sales' },
  { match: 'Santo Agostinho', text: 'A medida do amor é amar sem medida.', source: 'Santo Agostinho' },
  { match: 'Teresa de Calcutá', text: 'O essencial não é fazer grandes coisas, mas pequenas coisas com grande amor.', source: 'Santa Teresa de Calcutá' },
  { match: 'Terezinha', text: 'A humildade é a base de todas as virtudes.', source: 'Santa Terezinha do Menino Jesus' },
  { match: 'Teresa d', text: 'Nada te perturbe, nada te amedronte.', source: 'Santa Teresa d\'Ávila' },
  { match: 'Paulo Apóstolo', text: 'Tudo posso naquele que me fortalece.', source: 'São Paulo Apóstolo' },
  { match: 'João Crisóstomo', text: 'A oração é a respiração da alma.', source: 'São João Crisóstomo' },
  { match: 'Irineu', text: 'A glória de Deus é o homem vivo.', source: 'Santo Irineu' },
  { match: 'Boaventura', text: 'A perfeição da vida cristã está na caridade.', source: 'São Boaventura' },
  { match: 'João Paulo II', text: 'Não tenhais medo! Abri as portas a Cristo!', source: 'São João Paulo II' },
  { match: 'Pio', text: 'Rezai, esperai, não vos preocupeis.', source: 'São Pio de Pietrelcina' },
];

const MONTHS_BR = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function fmtBR(d) {
  return `${d.getDate()} de ${MONTHS_BR[d.getMonth()]} de ${d.getFullYear()}`;
}

function fmtBRMonth(m) {
  return MONTHS_BR[m - 1] || '';
}

function cleanGospelLine(line) {
  return line.replace(/^\d+\s*/g, '').replace(/([:;,\s])\d+\s*/g, '$1').replace(/["""']/g, '').replace(/^[-,;\s]+/, '').trim();
}

function pickQuote(dateStr, season, saintName, gospelLines) {
  // 1. Saint-specific quote if saint name matches
  if (saintName) {
    const saintQ = SAINT_QUOTES.find(q => saintName.includes(q.match));
    if (saintQ) return { text: saintQ.text, source: saintQ.source };
  }

  // 2. Gospel verse as quote of the day (prefer last line, skip "Naquele tempo" openers)
  if (gospelLines && gospelLines.length > 0) {
    for (var i = gospelLines.length - 1; i >= 0; i--) {
      var cleaned = cleanGospelLine(gospelLines[i]);
      if (cleaned.length > 30 && cleaned.length < 200 && !/^Naquele tempo/i.test(cleaned)) {
        return { text: cleaned, source: 'Evangelho do Dia' };
      }
    }
    // fallback: any line long enough
    for (var j = 0; j < gospelLines.length; j++) {
      var fallback = cleanGospelLine(gospelLines[j]);
      if (fallback.length > 30 && fallback.length < 200) {
        return { text: fallback, source: 'Evangelho do Dia' };
      }
    }
  }

  // 3. Season-specific pool, selected by date hash
  const pool = QUOTES_BY_SEASON[season] || QUOTES_BY_SEASON['Tempo Comum'];
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
  const idx = ((hash & 0x7fffffff) % pool.length + pool.length) % pool.length;
  return pool[idx];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fixStr(s) {
  return s.replace(/&#8217;/g, "'").replace(/&#8211;/g, '–').replace(/&amp;/g, '&').replace(/&#[\d]+;/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeHtml(str) {
  const ents = {
    '&aacute;':'á','&eacute;':'é','&iacute;':'í','&oacute;':'ó','&uacute;':'ú',
    '&agrave;':'à','&egrave;':'è','&ograve;':'ò',
    '&atilde;':'ã','&otilde;':'õ','&ccedil;':'ç','&ntilde;':'ñ',
    '&ocirc;':'ô','&ecirc;':'ê','&icirc;':'î','&acirc;':'â','&ucirc;':'û',
    '&nbsp;':' ','&amp;':'&','&quot;':'"','&lt;':'<','&gt;':'>',
    '&#8217;':"'",'&#8211;':'–','&#8212;':'—','&#8220;':'"','&#8221;':'"',
  };
  return str.replace(/&[a-z]+;/g, m => ents[m] || m).replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(parseInt(c))).replace(/\s+/g, ' ').trim();
}

// ---- GCatholic ICS ----

async function fetchICS() {
  const res = await fetch(ICS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`ICS fetch failed: ${res.status}`);
  return res.text();
}

function parseICS(text) {
  const events = [];
  const lines = text.split('\n');
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') { if (current?.dtstart) events.push(current); current = null; continue; }
    if (!current) continue;
    if (line.startsWith('DTSTART;VALUE=DATE:')) {
      const raw = line.slice(19).trim();
      current.dtstart = raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8);
    } else if (line.startsWith('SUMMARY:')) current.summary = line.slice(8).replace(/\\,/g, ',').trim();
  }
  return events;
}

function parseICSSummary(summary) {
  const colorEmoji = summary.match(/^([🟢🔴🟣⚪])/u)?.[1] || '🟢';
  const rankMatch = summary.match(/\[([^\]]+)\]/);
  const rankAbbr = rankMatch ? rankMatch[1] : '';
  const name = summary.replace(/^[🟢🔴🟣⚪]\s*(\[[^\]]+\]\s*)?/u, '').trim();
  return { colorEmoji, rankAbbr, name };
}

function seasonFromSummary(summary) {
  const s = summary.toLowerCase();
  if (s.includes('quaresma') || s.includes('cinzas')) return 'Quaresma';
  if (s.includes('advento')) return 'Advento';
  if (s.includes('natal')) return 'Tempo do Natal';
  if (s.includes('pascoa') || s.includes('pascoal')) return 'Tempo Pascal';
  return 'Tempo Comum';
}

function buildICSBackbone(events) {
  const byDate = {};
  for (const ev of events) {
    if (!ev.dtstart || !ev.summary) continue;
    if (!byDate[ev.dtstart]) byDate[ev.dtstart] = [];
    byDate[ev.dtstart].push(ev.summary);
  }

  const backbone = {};
  for (const [dateStr, summaries] of Object.entries(byDate)) {
    if (dateStr < '2026-06-28' || dateStr > '2026-12-31') continue;
    const d = new Date(dateStr + 'T12:00:00');
    const parsed = summaries.map(s => ({ summary: s, ...parseICSSummary(s) }));
    parsed.sort((a, b) => ({ S:0, F:1, M:2, m:3, 'm*':3, '':4 }[a.rankAbbr] ?? 5) - ({ S:0, F:1, M:2, m:3, 'm*':3, '':4 }[b.rankAbbr] ?? 5));
    const main = parsed[0];
    const color = COLOR_MAP[main.colorEmoji] || COLOR_MAP['🟢'];
    const rank = RANK_MAP[main.rankAbbr] || 'tempo';
    const season = seasonFromSummary(main.summary);

    const mmdd = dateStr.slice(5);
    const br = BR_OVERRIDES[mmdd];
    backbone[dateStr] = {
      date: dateStr,
      label: fmtBR(d),
      celebration: br?.celebration || main.name,
      rank: br?.rank || rank,
      season: br?.season || season,
      colorName: br?.colorName || color.colorName,
      cssColor: br?.cssColor || color.cssColor,
      source: br ? 'https://gcatholic.org/calendar/2026/General-G-pt' : 'https://gcatholic.org/calendar/2026/General-G-pt',
    };
  }
  return backbone;
}

// ---- Canção Nova Liturgy ----

async function fetchCNMonthLinks(month, year) {
  const url = `${CN_LITURGY}?sDia=1&sMes=${month}&sAno=${year}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const text = await res.text();
    const links = Array.from(text.matchAll(/href="([^"]*\/pb\/liturgia\/[^"]*\?(?:[^"]*&)?sDia=(\d+)&sMes=(\d+)&sAno=(\d+))"/g));
    return links
      .map(l => ({
        url: l[1].replace(/&amp;/g, '&'),
        day: parseInt(l[2]),
        month: parseInt(l[3]),
        year: parseInt(l[4]),
      }))
      .filter(l => l.url.match(/\/pb\/liturgia\/([^?]+)/)?.[1].length > 3);
}

async function fetchCNGospelFromUrl(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const raw = await res.text();
  const text = normalizeHtml(raw);

  const refs = Array.from(text.matchAll(/<div class="referencia">([^<]+)<\/div>/g));
  const gospelRef = refs.filter(r => /^(Mt|Mc|Lc|Jo|At)/.test(r[1])).pop()?.[1] || refs[refs.length - 1]?.[1];
  if (!gospelRef) return null;

  const gospelIdx = text.indexOf('Proclamação do Evangelho');
  if (gospelIdx < 0) return null;

  const gospelEnd = text.indexOf('Palavra da Salvação', gospelIdx);
  const gospelSection = gospelEnd > 0 ? text.slice(gospelIdx, gospelEnd + 100) : text.slice(gospelIdx, gospelIdx + 5000);

  const gospelText = gospelSection.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const bookMap = { Mt: 'Mateus', Mc: 'Marcos', Lc: 'Lucas', Jo: 'João', At: 'Atos' };
  const bookAbbr = gospelRef.replace(/[,\s].*$/, '');
  const bookName = bookMap[bookAbbr] || bookAbbr;
  const fullRef = `Evangelho de Jesus Cristo segundo ${bookName} (${gospelRef})`;

  const verses = extractKeyLines(gospelText);

  return { ref: fullRef, short: gospelRef, lines: verses, fullText: gospelText };
}

function extractKeyLines(text) {
  let clean = text.replace(/^Proclamação do Evangelho[^.]*\.\s*/i, '');
  clean = clean.replace(/^-[^.]*\.\s*/i, '');
  clean = clean.replace(/\s*Palavra da Salvação[\s\S]*$/, '').trim();
  const sentences = clean.split(/(?<=[\.!?])\s+/).filter(s => s.trim().length > 30);
  if (sentences.length >= 3) {
    return [
      sentences[0].replace(/^["""']|["""']$/g, '').trim(),
      sentences[Math.floor(sentences.length / 2)].replace(/^["""']|["""']$/g, '').trim(),
      sentences[sentences.length - 1].replace(/^["""']|["""']$/g, '').trim(),
    ];
  }
  if (sentences.length > 0) {
    const result = sentences.map(s => s.replace(/^["""']|["""']$/g, '').trim());
    while (result.length < 3) result.push(result[result.length - 1]);
    return result.slice(0, 3);
  }
  return [
    'A liturgia de hoje nos convida à escuta da Palavra de Deus.',
    'Cristo nos ensina o caminho da verdadeira felicidade.',
    'Que a mensagem do Evangelho transforme nossos corações.'
  ];
}

// ---- Canção Nova Saints ----

async function fetchCNSaints(month, year) {
  const url = `${CN_SAINTS}?sDia=1&sMes=${month}&sAno=${year}`;
  let html;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    html = await res.text();
  } catch { return null; }

  const calMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!calMatch) return null;

  const links = Array.from(calMatch[1].matchAll(/<a\s+href="([^"]+)"[^>]*>\s*(\d+)\s*<\/a>/g));
  if (links.length === 0) return null;

  const saints = {};
  for (const [, href, day] of links) {
    const fullUrl = href.startsWith('http') ? href : `https://santo.cancaonova.com${href}`;
    const dayNum = parseInt(day);
    try {
      const res = await fetch(fullUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      const page = await res.text();
      const nameMatch = page.match(/<h1 class="entry-title">\s*<span>([^<]+)<\/span>\s*<\/h1>/);
      const descMatch = page.match(/<div class="entry-content content-santo">([\s\S]*?)<\/div>/);
      if (nameMatch) {
        let desc = '';
        if (descMatch) {
          const text = descMatch[1].replace(/<[^>]+>/g, '').trim();
          desc = text.split('\n').map(l => l.trim()).filter(l => l.length > 30).slice(0, 3).join(' ').slice(0, 300);
        }
        const key = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        saints[key] = { name: fixStr(nameMatch[1]), desc: fixStr(desc), url: fullUrl.split('?')[0] };
      }
    } catch {}
    await sleep(200);
  }
  return saints;
}

// ---- Default Gospel ----

function defaultGospel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const diaSem = ['Domingo','Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado'][d.getDay()];
  return {
    ref: `Liturgia do ${diaSem} - ${fmtBR(d)}`,
    short: 'Mt 5, 1-12',
    lines: [
      'A liturgia de hoje nos convida à escuta da Palavra de Deus.',
      'Cristo nos ensina o caminho da verdadeira felicidade.',
      'Que a mensagem do Evangelho transforme nossos corações.',
    ],
  };
}

// ---- Main ----

async function main() {
  console.log('[1/4] Fetching gcatholic.org ICS...');
  const ics = await fetchICS();
  const events = parseICS(ics);
  const backbone = buildICSBackbone(events);
  console.log(`  ${Object.keys(backbone).length} dates with liturgical data.`);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  console.log(`[2/4] Fetching Canção Nova gospel for ${fmtBRMonth(currentMonth)}/${currentYear}...`);
  const cnMonthLinks = await fetchCNMonthLinks(currentMonth, currentYear);
  const cnGospels = {};
  if (cnMonthLinks) {
    const seen = new Set();
    const uniqueLinks = cnMonthLinks.filter(l => {
      if (seen.has(l.day)) return false;
      seen.add(l.day);
      const key = `${l.year}-${String(l.month).padStart(2, '0')}-${String(l.day).padStart(2, '0')}`;
      return key >= '2026-06-28' && key <= '2026-12-31';
    });
    console.log(`  ${uniqueLinks.length} days found in CN navigation.`);
    let fetched = 0;
    for (const link of uniqueLinks) {
      const key = `${link.year}-${String(link.month).padStart(2, '0')}-${String(link.day).padStart(2, '0')}`;
      const gospel = await fetchCNGospelFromUrl(link.url);
      if (gospel) {
        cnGospels[key] = gospel;
        fetched++;
      }
      await sleep(300);
    }
    console.log(`  ${fetched}/${uniqueLinks.length} gospel readings fetched.`);
  } else {
    console.log('  Could not fetch CN month links.');
  }

  console.log(`[3/4] Fetching Canção Nova saints for ${fmtBRMonth(currentMonth)}/${currentYear}...`);
  const cnSaints = await fetchCNSaints(currentMonth, currentYear);
  console.log(`  ${cnSaints ? Object.keys(cnSaints).length : 0} saint descriptions fetched.`);

  console.log('[4/4] Merging into calendar cache...');
  const calendar = JSON.parse(fs.readFileSync(calendarPath, 'utf8'));
  let created = 0;
  let updated = 0;

  for (const [dateStr, bc] of Object.entries(backbone)) {
    const d = new Date(dateStr + 'T12:00:00');
    const existing = calendar.entries[dateStr];

    const cnGospel = cnGospels[dateStr];
    const cnSaint = cnSaints?.[dateStr];
    const gospel = cnGospel || defaultGospel(dateStr);
    const saintName = cnSaint?.name || bc.celebration || '';
    const quote = pickQuote(dateStr, bc.season, saintName, gospel.lines);

    const entry = {
      status: 'complete',
      editionLabel: bc.label,
      liturgical: {
        country: 'BR',
        rank: bc.rank,
        season: bc.season,
        celebrationTitle: bc.celebration || '',
        colorName: bc.colorName,
        cssColor: bc.cssColor,
        gospelShort: gospel.short || 'Mt 5, 1-12',
      },
      saint: {
        feast: cnSaint ? `${cnSaint.name} - ${d.getDate()} de ${MONTHS_BR[d.getMonth()]}` : bc.celebration,
        name: cnSaint?.name || bc.celebration || '',
        description: cnSaint?.desc || `Celebração litúrgica do dia: ${bc.celebration || 'Tempo Comum'}.`,
        url: cnSaint?.url || bc.source,
      },
      gospel: {
        ref: gospel.ref,
        lines: gospel.lines,
      },
      closingQuote: quote,
      sourceUrl: cnSaint?.url || (cnGospel ? CN_LITURGY : bc.source),
    };

    if (existing) {
      const isPlaceholder = existing.saint.name === 'Santo do Dia' || existing.liturgical.gospelShort === 'Mt 1, 1';
      if (isPlaceholder) {
        calendar.entries[dateStr] = entry;
        updated++;
      } else {
        existing.editionLabel = bc.label;
        existing.liturgical.country = 'BR';
        existing.liturgical.rank = bc.rank;
        existing.liturgical.season = bc.season;
        existing.liturgical.celebrationTitle = bc.celebration || '';
        existing.liturgical.colorName = bc.colorName;
        existing.liturgical.cssColor = bc.cssColor;
        if (cnGospel) {
          existing.gospel.ref = gospel.ref;
          existing.gospel.lines = gospel.lines;
          existing.liturgical.gospelShort = gospel.short;
        }
        if (cnSaint) {
          existing.saint.name = cnSaint.name;
          existing.saint.description = cnSaint.desc || `Celebração litúrgica do dia: ${bc.celebration || 'Tempo Comum'}.`;
          existing.saint.url = cnSaint.url;
        } else {
          existing.saint.name = bc.celebration || '';
          if (!existing.saint.description) existing.saint.description = `Celebração litúrgica do dia: ${bc.celebration || 'Tempo Comum'}.`;
        }
        existing.closingQuote = quote;
        existing.sourceUrl = cnSaint?.url || (cnGospel ? CN_LITURGY : bc.source);
        updated++;
      }
    } else {
      calendar.entries[dateStr] = entry;
      created++;
    }
  }

  fs.writeFileSync(calendarPath, JSON.stringify(calendar, null, 2) + '\n');
  console.log(`Done. ${created} created, ${updated} updated. Total: ${Object.keys(calendar.entries).length} entries.`);
}

main().catch(err => { console.error(err); process.exit(1); });
