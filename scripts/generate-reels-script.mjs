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

function generateScript(selection) {
  const { date, liturgical, news, gospel, closingQuote, saint } = selection;

  const hasSerious = news.some(n => n.title.toLowerCase().includes('gaza') || n.title.toLowerCase().includes('guerra'));
  const hasInspiring = news.some(n => n.title.toLowerCase().includes('papa') || n.title.toLowerCase().includes('bento'));

  const topNews = news.slice(0, 2);

  let greeting;
  if (hasSerious) {
    greeting = pickRandom([
      'Bom dia! O dia de hoje pede um coração atento.',
      'Bom dia! Começando com fé, porque o mundo precisa de luz.',
    ]);
  } else if (hasInspiring) {
    greeting = pickRandom([
      'Bom dia! O dia amanheceu com notícia que aquece o coração.',
      'Bom dia! Hoje o céu parece mais perto.',
    ]);
  } else {
    greeting = pickRandom([
      'Bom dia, galera! Informação de qualidade pra começar o dia.',
      'E aí, pessoal! Bom dia! Vamos de resumo católico hoje?',
      'Fala, pessoal! Bom dia! Resumo das notícias pra você.',
    ]);
  }

  const liturgicalLine = pickRandom([
    `Semana ${liturgical.celebrationTitle?.match(/Semana\s+(\w+)/)?.[1] || 'comum'} do ${liturgical.season}. Cor litúrgica: ${liturgical.colorName}.`,
    `A Igreja vive o ${liturgical.season}. Hoje: ${liturgical.celebrationTitle}.`,
  ]);

  const saintLine = saint?.name
    ? `Dia de ${saint.name}.`
    : '';

  const newsLines = topNews.map((n, i) => {
    const title = n.title.replace(/^["']|["']$/g, '');
    const prefix = i === 0 ? 'Destaque' : 'Também';
    return `${prefix}: ${title}.`;
  });

  const verse = gospel.keyVerse || gospel.lines?.[0] || 'Jesus nos chama à conversão do coração.';
  const gospelReflection = pickRandom([
    `${gospel.ref}: ${verse}`,
    `No Evangelho de hoje: ${verse}`,
    `Na Palavra de hoje: ${verse}`,
  ]);

  const quoteLine = closingQuote?.text
    ? `"${closingQuote.text}" — ${closingQuote.source || ''}`
    : '';

  const catchphrase = pickRandom(CATCHPHRASES);

  const closing = `${catchphrase}`;

  const parts = [
    greeting,
    liturgicalLine,
    saintLine,
    ...newsLines,
    gospelReflection,
    quoteLine,
    closing,
  ];

  return parts.filter(Boolean).join('\n\n');
}

function calculateDuration(text) {
  const words = text.split(/\s+/).length;
  return Math.ceil(words / 2.5);
}

async function generateAudio(text, outputPath, voice = 'pt-BR-FranciscaNeural') {
  const { spawn } = await import('child_process');
  return new Promise((resolve, reject) => {
    const proc = spawn('edge-tts', [
      '--voice', voice,
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
