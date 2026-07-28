import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { randomBytes } from 'crypto';

const DATA_DIR = resolve('data');

function loadJSON(filename) {
  const p = join(DATA_DIR, filename);
  if (!existsSync(p)) throw new Error(`File not found: ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

function pickRandom(arr) {
  return arr[randomBytes(1)[0] % arr.length];
}

const CATCHPHRASES = [
  'Simbora semear o bem hoje!',
  'Bora ser boa semente onde quer que a gente passe!',
  'Partiu plantar esperança!',
  'Vamo nessa que a messe é grande e os trabalhadores são poucos!',
  'Bora fazer desse dia uma colheita de amor!',
  'Simbora que o bem sempre germina!',
  'Bora ser luz na vida de alguém hoje!',
  'Vai na fé que o trigo e o joio quem separa é Ele!',
  'Partiu viver a palavra na prática!',
  'Bora espalhar o bem sem olhar a quem!',
];

function buildNewsParagraph(item, index, total) {
  const { source, title, summary } = item;
  const cleanTitle = title.replace(/^["']|["']$/g, '').trim();

  const isFirst = index === 0;

  let leadIn;
  if (isFirst) {
    leadIn = pickRandom([
      `${source} destaca que`,
      `${source} informa:`,
      `Direto de ${source}:`,
    ]);
  } else {
    leadIn = pickRandom([
      `Já o ${source} registra que`,
      `Também o ${source} noticia:`,
      `Pelo ${source} ficamos sabendo que`,
    ]);
  }

  let context = summary
    .replace(/\s+/g, ' ')
    .replace(/\.\.\..*$|….*$/, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  let detail = '';
  if (context && context.length > 10) {
    const m = context.match(/^(.{30,200}[.!?:;])\s/);
    if (m) {
      detail = m[1] + ' ';
      if (detail.match(/^[a-záéíóúâêôãõç]/)) detail = detail.charAt(0).toLowerCase() + detail.slice(1);
    } else {
      detail = context.slice(0, 140).replace(/\s\S+$/, '') + '... ';
    }
  }

  const titlePart = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
  const titleEnd = titlePart.replace(/[.!?:;]$/, '') + '.';

  if (detail) {
    return `${leadIn} ${titleEnd} ${detail}`;
  }
  return `${leadIn} ${titleEnd}`;
}

function generateScript(selection) {
  const { liturgical, news, gospel, closingQuote, saint } = selection;

  const hasSerious = news.some(n => n.title.toLowerCase().includes('gaza') || n.title.toLowerCase().includes('guerra'));
  const hasPapa = news.some(n => n.title.toLowerCase().includes('papa') || n.title.toLowerCase().includes('leão'));

  const topNews = news.slice(0, 2);

  let greeting;
  if (hasSerious) {
    greeting = pickRandom([
      'Bom dia! O dia de hoje pede um coração atento e uma alma em oração.',
      'Bom dia! Vamos começar o dia com fé, porque o mundo precisa de luz.',
      'Bom dia! Que a paz de Cristo habite nos nossos corações neste dia.',
    ]);
  } else if (hasPapa) {
    greeting = pickRandom([
      'Bom dia! O dia amanheceu com notícias que aquecem o coração.',
      'Bom dia! Hoje o céu parece mais perto da gente.',
      'Bom dia! A Igreja está viva e nós vamos provar com estas notícias.',
    ]);
  } else {
    greeting = pickRandom([
      'Bom dia! Informação de qualidade para começar o dia com o pé direito.',
      'Bom dia! Vamos de resumo católico com notícias que edificam.',
      'Bom dia! Preparado para se manter bem informado? Vamos nessa.',
    ]);
  }

  const seasonLow = liturgical.season.toLowerCase();
  const celebrationLow = liturgical.celebrationTitle.toLowerCase().replace(new RegExp(`,? do ${seasonLow}$`, 'i'), '');
  const liturgicalLine = pickRandom([
    `A Igreja celebra ${celebrationLow}, do ${seasonLow}, cor litúrgica ${liturgical.colorName}.`,
    `Estamos no ${seasonLow}, e hoje é ${celebrationLow}, com a cor litúrgica ${liturgical.colorName}.`,
  ]);

  const saintLine = saint?.name
    ? `Neste dia lembramos ${saint.name.replace(/^Beatos?\s+|^Santo\s+|^Santa\s+|^São\s+|^Beatas?\s+/i, '')}.`
    : '';

  const verse = gospel.lines?.find(l => l.length < 120) || gospel.keyVerse || gospel.lines?.[0] || 'Jesus nos chama à conversão do coração.';
  const gospelLine = pickRandom([
    `No Evangelho de hoje, ${gospel.ref}. ${verse}`,
    `A Palavra de hoje está em ${gospel.ref}. ${verse}`,
  ]);

  const newsParagraphs = topNews.map((n, i) =>
    buildNewsParagraph(n, i, topNews.length)
  );

  const quoteLine = closingQuote?.text
    ? `Para refletir: "${closingQuote.text}" — ${closingQuote.source || ''}`
    : '';

  const catchphrase = pickRandom(CATCHPHRASES);

  const parts = [
    greeting,
    liturgicalLine,
    saintLine,
    gospelLine,
    ...newsParagraphs,
    quoteLine,
    catchphrase,
  ];

  return parts.filter(Boolean).join('\n\n');
}

function calculateDuration(text) {
  const words = text.split(/\s+/).length;
  return Math.ceil(words / 2.9);
}

async function generateAudio(text, outputPath, voice = 'pt-BR-AntonioNeural') {
  const { spawn } = await import('child_process');
  return new Promise((resolve, reject) => {
    const proc = spawn('edge-tts', [
      '--voice', voice,
      '--rate', '+15%',
      '--text', text,
      '--write-media', outputPath,
    ]);
    let err = '';
    proc.stderr.on('data', d => err += d.toString());
    proc.on('close', code => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`edge-tts exited ${code}: ${err}`));
    });
    proc.on('error', reject);
  });
}

async function main() {
  const selection = loadJSON('daily-selection.json');
  const script = generateScript(selection);
  const date = selection.date;

  const txtPath = join(DATA_DIR, `reels-script-${date}.txt`);
  writeFileSync(txtPath, script, 'utf8');
  console.log(`Script gerado: ${txtPath}`);

  const seconds = calculateDuration(script);
  console.log(`Duração estimada: ~${seconds}s`);

  console.log('\n--- ROTEIRO ---\n');
  console.log(script);
  console.log('\n--- FIM ---\n');

  if (!existsSync(join(DATA_DIR, 'audio'))) mkdirSync(join(DATA_DIR, 'audio'), { recursive: true });
  const audioPath = join(DATA_DIR, 'audio', `reels-${date}.mp3`);
  await generateAudio(script, audioPath);
  console.log(`Áudio gerado: ${audioPath}`);
}

const isMain = process.argv[1] && (
  process.argv[1] === resolve('scripts', 'generate-reels-script.mjs') ||
  process.argv[1].endsWith('generate-reels-script.mjs')
);
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export { generateScript, calculateDuration, generateAudio };
