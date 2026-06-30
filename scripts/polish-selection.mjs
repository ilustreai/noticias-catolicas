import { readJson, validateSelection, writeFileEnsured } from './lib.mjs';

const filePath = process.argv[2] || 'data/daily-selection.json';

const fixes = [
  [/\bNoticias Catolicas\b/g, 'Notícias Católicas'],
  [/\bCatolicas\b/g, 'Católicas'],
  [/\bcatolicas\b/g, 'católicas'],
  [/\bVoce\b/g, 'Você'],
  [/\bvoce\b/g, 'você'],
  [/\bconteudo\b/g, 'conteúdo'],
  [/\bconteudos\b/g, 'conteúdos'],
  [/\bSao\b/g, 'São'],
  [/\bsao\b/g, 'são'],
  [/\bLeao\b/g, 'Leão'],
  [/\bleao\b/g, 'leão'],
  [/\bCancao\b/g, 'Canção'],
  [/\bcancao\b/g, 'canção'],
  [/\bapostolos\b/g, 'apóstolos'],
  [/\bApostolos\b/g, 'Apóstolos'],
  [/\bfe\b/g, 'fé'],
  [/\bpregacao\b/g, 'pregação'],
  [/\bmissionario\b/g, 'missionário'],
  [/\binicio\b/g, 'início'],
  [/\bseculo\b/g, 'século'],
  [/\bperseguicao\b/g, 'perseguição'],
  [/\bcristaos\b/g, 'cristãos'],
  [/\bCristaos\b/g, 'Cristãos'],
  [/\bcrista\b/g, 'cristã'],
  [/\bliturgico\b/g, 'litúrgico'],
  [/\bLiturgico\b/g, 'Litúrgico'],
  [/\bMemoria\b/g, 'Memória'],
  [/\bmemoria\b/g, 'memória'],
  [/\bdiscipulos\b/g, 'discípulos'],
  [/\btras\b/g, 'trás'],
  [/\bmissao\b/g, 'missão'],
  [/\bvitimas\b/g, 'vítimas'],
  [/\bConsistorio\b/g, 'Consistório'],
  [/\bconsistorio\b/g, 'consistório'],
  [/\bproprio\b/g, 'próprio'],
  [/\bdisposicao\b/g, 'disposição'],
  [/\bcriterio\b/g, 'critério'],
  [/\bdivisoes\b/g, 'divisões'],
  [/\bdimensao\b/g, 'dimensão'],
  [/\breuniao\b/g, 'reunião'],
  [/\bcomunhao\b/g, 'comunhão'],
  [/\bevangelizacao\b/g, 'evangelização'],
  [/\btres\b/g, 'três'],
  [/\bdecadas\b/g, 'décadas'],
  [/\bpresenca\b/g, 'presença'],
  [/\bgratidao\b/g, 'gratidão'],
  [/\bvoluntarios\b/g, 'voluntários'],
  [/\bparticipacao\b/g, 'participação'],
  [/\bantidoto\b/g, 'antídoto'],
  [/\bmartires\b/g, 'mártires'],
  [/\bcatolica\b/g, 'católica'],
  [/\bCatolica\b/g, 'Católica'],
  [/\bdiaria\b/g, 'diária'],
  [/\b13a Semana\b/g, '13ª Semana']
];

const blockedNews = [
  /Continue lendo/i,
  /&#8594;|&amp;#8594;/i,
  /O post .* apareceu primeiro/i,
  /placar/i,
  /jogo contra/i,
  /torcem juntos/i,
  /classificação garantida/i,
  /Acolhidos da Fazenda.*jogo/i,
  /Santo .* celebrado no dia/i,
  /L'articolo/i
];

function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code) => {
      const value = code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : '';
    });
}

function polishText(text) {
  let output = decodeEntities(text)
    .replace(/Continue lendo\s*(?:→|->)?/gi, '')
    .replace(/\s*O post .+?(?:apareceu primeiro\.?|$)/i, '')
    .replace(/\s*L'articolo .+$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/,\./g, '.')
    .trim();
  for (const [pattern, replacement] of fixes) output = output.replace(pattern, replacement);
  return output;
}

function polishValue(value, key = '') {
  if (typeof value === 'string') return key === 'url' ? value : polishText(value);
  if (Array.isArray(value)) return value.map((item) => polishValue(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, polishValue(entryValue, entryKey)]));
}

function isBlockedNews(item) {
  const text = `${item.title} ${item.summary} ${item.url}`;
  return blockedNews.some((pattern) => pattern.test(text));
}

const selection = polishValue(readJson(filePath));
selection.news = selection.news.filter((item) => !isBlockedNews(item));

const result = validateSelection(selection);
if (!result.ok) {
  console.error('Polished selection failed validation:');
  result.errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

writeFileEnsured(filePath, `${JSON.stringify(selection, null, 2)}\n`);
console.log(`Polished ${filePath}: ${selection.news.length} news items.`);
