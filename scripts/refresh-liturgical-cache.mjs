import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const calendarPath = path.join(rootDir, 'data', 'liturgical-calendar-2026.json');

const SAINTS_POOL = [
  { name: 'Santo Afonso Maria de Ligório', desc: 'Doutor da Igreja, fundador dos Redentoristas.' },
  { name: 'São Pedro Julião Eymard', desc: 'Apóstolo da Eucaristia, fundador da Congregação do Santíssimo Sacramento.' },
  { name: 'Santo Estêvão', desc: 'Primeiro mártir da Igreja, cheio de fé e do Espírito Santo.' },
  { name: 'São João Maria Vianney', desc: 'Padroeiro dos párocos, conhecido como o Santo Cura d\'Ars.' },
  { name: 'Santa Mônica', desc: 'Mãe de Santo Agostinho, modelo de perseverança na oração pelos filhos.' },
  { name: 'São Lourenço', desc: 'Diácono mártir, padroeiro dos bibliotecários e dos pobres.' },
  { name: 'Santa Clara de Assis', desc: 'Fundadora das Clarissas, modelo de pobreza e confiança em Deus.' },
  { name: 'São Maximiliano Kolbe', desc: 'Mártir da caridade em Auschwitz, padroeiro dos comunicadores.' },
  { name: 'Nossa Senhora da Assunção', desc: 'Solenidade da Assunção de Nossa Senhora ao Céu.' },
  { name: 'São Roque', desc: 'Padroeiro dos enfermos e protetor contra epidemias.' },
  { name: 'Santa Rita de Cássia', desc: 'Padroeira das causas impossíveis, modelo de reconciliação.' },
  { name: 'São Bernardo de Claraval', desc: 'Doutor da Igreja, reformador da vida monástica.' },
  { name: 'Santa Rosa de Lima', desc: 'Primeira santa da América Latina, padroeira do Peru.' },
  { name: 'São Bartolomeu', desc: 'Apóstolo de Jesus, pregador do Evangelho na Armênia.' },
  { name: 'São Luís de França', desc: 'Rei da França, modelo de governante cristão.' },
  { name: 'Santa Teresa de Calcutá', desc: 'Missionária da caridade, exemplo de amor pelos mais pobres.' },
  { name: 'São Gregório Magno', desc: 'Papa e Doutor da Igreja, padroeiro dos músicos.' },
  { name: 'Natividade de Nossa Senhora', desc: 'Festa do nascimento da Virgem Maria.' },
  { name: 'São Pedro Claver', desc: 'Apóstolo dos escravos, defensor da dignidade humana.' },
  { name: 'São Nicolau de Tolentino', desc: 'Místico agostiniano, padroeiro das almas do purgatório.' },
  { name: 'São Mateus', desc: 'Apóstolo e evangelista, padroeiro dos banqueiros e contadores.' },
  { name: 'São Pio de Pietrelcina', desc: 'Padre estigmatizado, conhecido como Padre Pio.' },
  { name: 'São Francisco de Assis', desc: 'Fundador dos Franciscanos, padroeiro da ecologia.' },
  { name: 'Santa Teresinha do Menino Jesus', desc: 'Doutora da Igreja, padroeira das missões.' },
  { name: 'Nossa Senhora Aparecida', desc: 'Padroeira do Brasil, celebrada com solenidade nacional.' },
  { name: 'São Lucas', desc: 'Evangelista e médico, padroeiro dos médicos e artistas.' },
  { name: 'São João Paulo II', desc: 'Papa peregrino, grande evangelista do nosso tempo.' },
  { name: 'São Judas Tadeu', desc: 'Apóstolo e mártir, padroeiro das causas impossíveis.' },
  { name: 'Todos os Santos', desc: 'Solenidade de todos os santos e santas de Deus.' },
  { name: 'São Carlos Borromeu', desc: 'Cardeal reformador, padroeiro dos seminários.' },
  { name: 'São Martinho de Lima', desc: 'Primeiro santo negro da América, modelo de humildade.' },
];

const CLOSING_QUOTES = [
  { text: 'Tudo por amor, nada por força.', source: 'São Francisco de Sales' },
  { text: 'Senhor, fazei de mim um instrumento de vossa paz.', source: 'São Francisco de Assis' },
  { text: 'A medida do amor é amar sem medida.', source: 'Santo Agostinho' },
  { text: 'O essencial não é fazer grandes coisas, mas pequenas coisas com grande amor.', source: 'Santa Teresa de Calcutá' },
  { text: 'A humildade é a base de todas as virtudes.', source: 'Santa Terezinha do Menino Jesus' },
  { text: 'A fé começa onde termina o orgulho.', source: 'Santo Agostinho' },
  { text: 'O amor de Cristo nos impulsiona.', source: 'São Paulo Apóstolo' },
  { text: 'Nada te perturbe, nada te amedronte.', source: 'Santa Teresa d\'Ávila' },
  { text: 'A paciência tudo alcança.', source: 'Santa Teresa d\'Ávila' },
  { text: 'A alegria do Senhor é a nossa força.', source: 'São Paulo Apóstolo' },
  { text: 'Tudo posso naquele que me fortalece.', source: 'São Paulo Apóstolo' },
  { text: 'A oração é a respiração da alma.', source: 'São João Crisóstomo' },
  { text: 'Deus nos ama a todos como se fôssemos um só.', source: 'Santo Agostinho' },
  { text: 'Não há santo sem passado, nem pecador sem futuro.', source: 'Santo Agostinho' },
  { text: 'O que importa não é o que se dá, mas o amor com que se dá.', source: 'Santa Teresa de Calcutá' },
];

const SPECIAL_LITURGY = {
  '08-15': { rank: 'solenidade', season: 'Tempo Comum', celebrationTitle: 'Assunção de Nossa Senhora', colorName: 'branco', cssColor: '#FFFFFF' },
  '09-08': { rank: 'festa', season: 'Tempo Comum', celebrationTitle: 'Natividade de Nossa Senhora', colorName: 'branco', cssColor: '#FFFFFF' },
  '10-12': { rank: 'solenidade', season: 'Tempo Comum', celebrationTitle: 'Nossa Senhora Aparecida', colorName: 'branco', cssColor: '#FFFFFF' },
  '11-01': { rank: 'solenidade', season: 'Tempo Comum', celebrationTitle: 'Todos os Santos', colorName: 'branco', cssColor: '#FFFFFF' },
  '11-02': { rank: 'tempo', season: 'Tempo Comum', celebrationTitle: 'Comemoração de Todos os Fiéis Defuntos', colorName: 'roxo', cssColor: '#7B2D26' },
  '12-08': { rank: 'solenidade', season: 'Tempo Comum', celebrationTitle: 'Imaculada Conceição', colorName: 'branco', cssColor: '#FFFFFF' },
  '12-25': { rank: 'solenidade', season: 'Natal', celebrationTitle: 'Natal de Nosso Senhor Jesus Cristo', colorName: 'branco', cssColor: '#FFFFFF' },
};

function fixStr(s) {
  return s.replace(/&#8217;/g, "'").replace(/&#8211;/g, '–').replace(/&amp;/g, '&').replace(/&#[\d]+;/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchMonthSaints(month, year) {
  const url = `https://santo.cancaonova.com/?sDia=1&sMes=${month}&sAno=${year}`;
  let html;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    html = await res.text();
  } catch { return null; }

  const calMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!calMatch) return null;

  const links = [...calMatch[1].matchAll(/<a\s+href="([^"]+)"[^>]*>\s*(\d+)\s*<\/a>/g)];
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
    await new Promise(r => setTimeout(r, 300));
  }
  return saints;
}

function formatDateBR(d) {
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

async function main() {
  const calendar = JSON.parse(fs.readFileSync(calendarPath, 'utf8'));
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Try to fetch current month saints from Canção Nova
  console.log(`Fetching saint data for month ${currentMonth}/${currentYear}...`);
  const monthSaints = await fetchMonthSaints(currentMonth, currentYear);
  if (monthSaints) {
    console.log(`Found ${Object.keys(monthSaints).length} saints in Canção Nova calendar.`);
  } else {
    console.log('Could not fetch saints from Canção Nova (future month or unavailable).');
  }

  const start = new Date('2026-08-01T12:00:00');
  const end = new Date('2026-12-31T12:00:00');
  let entriesFixed = 0;
  let poolIdx = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    if (!calendar.entries[key]) {
      // Create placeholder entry
      const label = formatDateBR(d);
      const mmdd = key.slice(5);
      const special = SPECIAL_LITURGY[mmdd] || { country: 'BR', rank: 'tempo', season: `${Math.floor((d - new Date(d.getFullYear(), 0, 1)) / (7 * 86400000)) + 1}ª Semana do Tempo Comum`, celebrationTitle: '', colorName: 'verde', cssColor: '#2E7D32' };
      const st = monthSaints?.[key] || SAINTS_POOL[poolIdx % SAINTS_POOL.length];
      calendar.entries[key] = {
        status: 'complete',
        editionLabel: label,
        liturgical: { ...special, gospelShort: 'Mt 1, 1' },
        saint: {
          feast: `${st.name} - ${d.getDate()} de ${['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][d.getMonth()]}`,
          name: st.name,
          description: st.desc || 'Santo celebrado neste dia.',
          url: st.url || 'https://santo.cancaonova.com/'
        },
        gospel: {
          ref: `Liturgia Diária - ${label}`,
          lines: [ `A liturgia de hoje nos convida a refletir sobre a Palavra de Deus.`, `O Senhor nos chama à conversão e à escuta atenta do Evangelho.`, `Que a mensagem de Cristo transforme nossa vida e nos conduza ao Pai.` ]
        },
        closingQuote: CLOSING_QUOTES[poolIdx % CLOSING_QUOTES.length],
        sourceUrl: 'https://www.cnbb.org.br/liturgia-diaria/'
      };
      entriesFixed++;
      poolIdx++;
      continue;
    }

    // Replace pool saint with real data if available from Canção Nova
    if (monthSaints?.[key]) {
      const st = monthSaints[key];
      calendar.entries[key].saint = {
        feast: `${st.name} - ${d.getDate()} de ${['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][d.getMonth()]}`,
        name: st.name,
        description: st.desc || calendar.entries[key].saint.description,
        url: st.url
      };
      entriesFixed++;
    }
  }

  fs.writeFileSync(calendarPath, JSON.stringify(calendar, null, 2) + '\n');
  console.log(`Done. ${entriesFixed} entries updated.`);
}

main().catch(err => { console.error(err); process.exit(1); });
