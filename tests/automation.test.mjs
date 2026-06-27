import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPage,
  escapeHtml,
  validateSelection,
  validateRenderedHtml
} from '../scripts/lib.mjs';

const validSelection = {
  date: '2026-06-26',
  editionLabel: '26 de junho de 2026',
  liturgical: {
    season: 'Tempo Comum',
    colorName: 'verde',
    cssColor: '#1F6B45',
    gospelShort: 'Mt 8, 1-4'
  },
  saint: {
    feast: 'Festa - 26 de Junho',
    name: 'Santo Josemaria Escrivá',
    description: 'Fundador do Opus Dei, ensinou a santidade no trabalho ordinário.'
  },
  gospel: {
    ref: 'Mateus 8, 1-4 - Tempo Comum',
    lines: [
      'Se quiseres, podes purificar-me.',
      'Jesus estendeu a mão, tocou-o e disse: Quero, fica purificado.',
      'E imediatamente ficou curado da lepra.'
    ]
  },
  sponsor: {
    enabled: true,
    label: 'Apoio',
    text: 'Arte sacra personalizada por ilustre.ai',
    url: 'https://www.instagram.com/ilustre.ai'
  },
  news: [
    {
      source: 'Vatican News',
      title: 'Papa Leão XIV pede apoio, franqueza e lealdade aos cardeais',
      summary: 'Na abertura do Consistório Extraordinário, o Papa pediu apoio público e conselhos sinceros.',
      url: 'https://www.vaticannews.va/pt/papa/news/2026-06/papa-leao-xiv-discurso-abertura-consistorio-extraordinario-junho.html'
    },
    {
      source: 'Vatican News',
      title: 'Na missa do Consistório, Papa afirma que a Igreja é para todos',
      summary: 'Leão XIV apresentou orientações centradas na fé, na paz e na concórdia.',
      url: 'https://www.vaticannews.va/pt/papa/news/2026-06/papa-missa-abertura-consistorio-extraordinario-homilia.html'
    },
    {
      source: 'Vatican News',
      title: 'Consistório reúne 178 cardeais para refletir sobre a missão da Igreja',
      summary: 'A primeira sessão tratou de desafios como polarizações, violência e crise da família.',
      url: 'https://www.vaticannews.va/pt/vaticano/news/2026-06/consistorio-178-cardeais-participam-trabalhos-primeira-sessao.html'
    },
    {
      source: 'Vatican News',
      title: 'Cardeal ucraniano leva ao Papa sinais de sofrimento e esperança',
      summary: 'O cardeal Mykola Bychok relatou a entrega ao Papa de sinais da guerra na Ucrânia.',
      url: 'https://www.vaticannews.va/pt/igreja/news/2026-06/cardral-bychok-ucrania-guerra-paz-consistorio-papa-audiencia.html'
    },
    {
      source: 'ACI Digital',
      title: 'São Josemaria Escrivá é lembrado como o santo do ordinário',
      summary: 'Na festa de 26 de junho, a ACI recorda o fundador do Opus Dei.',
      url: 'https://www.acidigital.com/noticia/52460/hoje-e-celebrado-sao-josemaria-escriva-o-santo-do-ordinario'
    }
  ]
};

test('escapeHtml neutralizes HTML injection', () => {
  assert.equal(
    escapeHtml('<script>alert("x")</script> & "quote"'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quote&quot;'
  );
});

test('validateSelection accepts a complete public edition', () => {
  const result = validateSelection(validSelection);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateSelection rejects internal automation language and weak editions', () => {
  const draft = structuredClone(validSelection);
  draft.news = draft.news.slice(0, 1);
  draft.news[0].summary = 'teste manual com confiança alta, revalidar link';

  const result = validateSelection(draft);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /at least 5 news items/);
  assert.match(result.errors.join('\n'), /internal term/);
});

test('buildPage renders news, sponsor bar and liturgical color without internal terms', () => {
  const html = buildPage(validSelection);

  assert.match(html, /--liturgical-color: #1F6B45;/);
  assert.match(html, /Papa Leão XIV pede apoio/);
  assert.match(html, /class="sponsor-bar"/);
  assert.match(html, /Arte sacra personalizada por ilustre\.ai/);
  assert.doesNotMatch(html, /Curadoria em revisão|teste manual|confiança|revalidar|não confirmado/i);
});

test('validateRenderedHtml rejects broken or unsafe output', () => {
  const badHtml = '<html><body>teste manual <a href="https://example.com">link</a></body></html>';
  const result = validateRenderedHtml(badHtml, validSelection);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /internal term/);
  assert.match(result.errors.join('\n'), /missing rel/);
});
