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

function cleanSummary(summary) {
  return summary
    .replace(/\s+/g, ' ')
    .replace(/\.\.\..*$|….*$/, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+"/g, ' ')
    .trim();
}

function makeNewsSentence(item, index) {
  const { source, title, summary } = item;
  const cleanTitle = title.replace(/^["']|["']$/g, '').trim();
  const ctx = cleanSummary(summary);

  let lead;
  if (index === 0) {
    lead = pickRandom([
      `Segundo ${source},`,
      `${source} informa:`,
      `De ${source}:`,
    ]);
  } else {
    lead = pickRandom([
      `Já ${source} destaca que`,
      `Também ${source} registra que`,
      `${source} noticia que`,
    ]);
  }

  const fallback = `${lead} ${cleanTitle.charAt(0).toLowerCase() + cleanTitle.slice(1)}.`;
  if (!ctx || ctx.length < 20) return fallback;

  const firstDot = ctx.match(/^[^.!?:;]{15,140}[.!?:;]/);
  if (!firstDot) {
    const truncated = ctx.slice(0, 120).replace(/\s\S+$/, '');
    return `${lead} ${truncated.charAt(0).toLowerCase() + truncated.slice(1)}.`;
  }

  let snippet = firstDot[0];
  if (snippet.length < 80) {
    const secondDot = ctx.slice(snippet.length).match(/^[^.!?:;]{10,60}[.!?:;]/);
    if (secondDot) snippet += ' ' + secondDot[0].trim();
  }
  snippet = snippet.replace(/\.$/, '');

  let sentence;
  if (snippet.match(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/)) {
    sentence = `${lead} ${snippet.charAt(0).toLowerCase() + snippet.slice(1)}.`;
  } else {
    sentence = `${lead} ${snippet}.`;
  }
  return sentence;
}

function buildRuleScript(selection) {
  const { liturgical, news, gospel, closingQuote, saint } = selection;

  const hasSerious = news.some(n => n.title.toLowerCase().includes('gaza') || n.title.toLowerCase().includes('guerra'));
  const hasPapa = news.some(n => n.title.toLowerCase().includes('papa') || n.title.toLowerCase().includes('leão'));

  let greeting;
  if (hasSerious) {
    greeting = pickRandom([
      'Bom dia! O dia de hoje pede um coração atento e uma alma em oração.',
      'Bom dia! Vamos começar o dia com fé.',
      'Bom dia! Que a paz de Cristo habite nos nossos corações neste dia.',
    ]);
  } else if (hasPapa) {
    greeting = pickRandom([
      'Bom dia! O dia amanheceu com notícias que aquecem o coração.',
      'Bom dia! A Igreja está viva e nós vamos provar com estas notícias.',
    ]);
  } else {
    greeting = pickRandom([
      'Bom dia! Informação de qualidade para começar o dia.',
      'Bom dia! Vamos de resumo católico com notícias que edificam.',
      'Bom dia! Preparado para se manter bem informado? Vamos nessa.',
    ]);
  }

  const seasonLow = liturgical.season.toLowerCase();
  const celebrationLow = liturgical.celebrationTitle.toLowerCase().replace(new RegExp(`,? do ${seasonLow}$`, 'i'), '');
  const liturgicalLine = `A Igreja celebra ${celebrationLow}, do ${seasonLow}, cor litúrgica ${liturgical.colorName}.`;

  const saintLine = saint?.name
    ? `Neste dia lembramos ${saint.name.replace(/^Beatos?\s+|^Santo\s+|^Santa\s+|^São\s+|^Beatas?\s+/i, '')}.`
    : '';

  const verse = gospel.lines?.find(l => l.length < 120) || gospel.keyVerse || gospel.lines?.[0] || 'Jesus nos chama à conversão do coração.';
  const gospelLine = pickRandom([
    `No Evangelho de hoje, ${gospel.ref}. ${verse}`,
    `A Palavra de hoje está em ${gospel.ref}. ${verse}`,
  ]);

  const newsLines = news.map((n, i) => makeNewsSentence(n, i));

  const quoteLine = closingQuote?.text
    ? `Para refletir: "${closingQuote.text}" — ${closingQuote.source || ''}`
    : '';

  const catchphrase = pickRandom(CATCHPHRASES);

  return [
    greeting,
    liturgicalLine,
    saintLine,
    gospelLine,
    ...newsLines,
    quoteLine,
    catchphrase,
  ].filter(Boolean).join('\n\n');
}

function buildPrompt(selection) {
  const newsBlock = selection.news.map((n, i) =>
    `  ${i + 1}. [${n.source}] "${n.title}" — ${n.summary.replace(/\s+/g, ' ').slice(0, 300)}`
  ).join('\n');

  return `Crie um roteiro NATURAL e FLUÍDO em português brasileiro para um vídeo Reels de ~45 segundos sobre notícias católicas. Escreva como UM APRESENTADOR HUMANO lendo um telejornal — com pausas naturais, entonação e ritmo de fala real. Nada de listas, bullet points ou marcas de formato. Apenas texto corrido e fluído.

ESTRUTURA:
- Saudação curta e calorosa (1 frase)
- Liturgia do dia (1 frase)
- Santo do dia (1 frase)
- Evangelho do dia (1 frase)
- NOTÍCIAS: uma frase fluída para CADA notícia, com contexto do summary
- Frase para reflexão (1 frase)
- Encerramento com bordão católico jovem (1 frase)

DADOS DE HOJE:
- Liturgia: ${selection.liturgical.celebrationTitle}, ${selection.liturgical.season}, cor ${selection.liturgical.colorName}
- Santo: ${selection.saint?.name || 'N/A'}
- Evangelho: ${selection.gospel.ref} — ${(selection.gospel.keyVerse || selection.gospel.lines?.[0] || '').slice(0, 200)}
- Notícias:
${newsBlock}
- Reflexão: "${selection.closingQuote?.text || ''}" (${selection.closingQuote?.source || ''})

REGRAS:
- NÃO liste as notícias com números ou marcadores
- INTEGRE cada notícia numa frase natural que inclua contexto do summary
- Use transições como "enquanto isso", "também", "já", "por sua vez"
- NUNCA repita a palavra "notícia" ou "noticia"
- Máximo 350 palavras no total
- Apenas o texto do roteiro, sem introdução ou explicação`;
}

async function buildGeminiScript(selection) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.AI_MODEL || 'gemini-2.0-flash';
  const prompt = buildPrompt(selection);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[Gemini] API error ${response.status}: ${errText}`);
    return null;
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

async function buildOpenAIScript(selection) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const prompt = buildPrompt(selection);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[OpenAI] API error ${response.status}: ${errText}`);
    return null;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function generateScript(selection) {
  const gemini = await buildGeminiScript(selection);
  if (gemini) {
    console.log('[Gemini] Script gerado por IA (gratuito)');
    return gemini;
  }
  const openai = await buildOpenAIScript(selection);
  if (openai) {
    console.log('[OpenAI] Script gerado por IA');
    return openai;
  }
  console.log('[AI] Nenhuma API configurada, usando roteiro baseado em regras');
  return buildRuleScript(selection);
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
  const script = await generateScript(selection);
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

export { buildRuleScript, generateScript, calculateDuration, generateAudio };
