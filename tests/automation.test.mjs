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
    country: 'BR',
    rank: 'tempo',
    season: 'Tempo Comum',
    colorName: 'verde',
    cssColor: '#1F6B45',
    gospelShort: 'Mt 8, 1-4'
  },
  saint: {
    feast: 'Festa - 26 de Junho',
    name: 'Santo Josemaria Escriva',
    description: 'Fundador do Opus Dei, ensinou a santidade no trabalho ordinario.'
  },
  gospel: {
    ref: 'Mateus 8, 1-4 - Tempo Comum',
    lines: [
      'Se quiseres, podes purificar-me.',
      'Jesus estendeu a mao, tocou-o e disse: Quero, fica purificado.',
      'E imediatamente ficou curado da lepra.'
    ]
  },
  sponsor: {
    enabled: true,
    label: 'Apoio',
    text: 'Assine o @ilustre.ai no Instagram para receber conteudos exclusivos de arte sacra, fe e inspiracao visual.',
    url: 'https://www.instagram.com/ilustre.ai'
  },
  news: [
    {
      source: 'Vatican News',
      title: 'Papa Leao XIV pede apoio, franqueza e lealdade aos cardeais',
      summary: 'Na abertura do Consistorio Extraordinario, o Papa pediu apoio publico e conselhos sinceros.',
      url: 'https://www.vaticannews.va/pt/papa/news/2026-06/papa-leao-xiv-discurso-abertura-consistorio-extraordinario-junho.html'
    },
    {
      source: 'Vatican News',
      title: 'Na missa do Consistorio, Papa afirma que a Igreja e para todos',
      summary: 'Leao XIV apresentou orientacoes centradas na fe, na paz e na concordia.',
      url: 'https://www.vaticannews.va/pt/papa/news/2026-06/papa-missa-abertura-consistorio-extraordinario-homilia.html'
    },
    {
      source: 'CNBB',
      title: 'Igreja no Brasil reforca iniciativas pastorais pela paz',
      summary: 'A CNBB destacou a importancia de comunidades locais promoverem reconciliacao e cuidado com os vulneraveis.',
      url: 'https://www.cnbb.org.br/igreja-no-brasil-reforca-iniciativas-pastorais-pela-paz/'
    },
    {
      source: 'Cancao Nova',
      title: 'Comunidades catolicas ampliam acoes de evangelizacao digital',
      summary: 'Iniciativas de formacao e oracao online ajudam familias a acompanhar a vida da Igreja durante a semana.',
      url: 'https://noticias.cancaonova.com/brasil/comunidades-catolicas-ampliam-acoes-de-evangelizacao-digital/'
    },
    {
      source: 'ACI Digital',
      title: 'Bispos latino-americanos chamam atencao para defesa da vida',
      summary: 'A cobertura internacional acompanha pronunciamentos catolicos sobre dignidade humana, familia e compromisso social.',
      url: 'https://www.acidigital.com/noticia/00000/bispos-latino-americanos-defesa-da-vida'
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
  draft.news[0].summary = 'teste manual com confianca alta, revalidar link';

  const result = validateSelection(draft);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /at least 5 news items/);
  assert.match(result.errors.join('\n'), /internal term/);
});

test('validateSelection rejects poor source diversity and saint content inside news', () => {
  const draft = structuredClone(validSelection);
  draft.news = [
    ...validSelection.news.slice(0, 2),
    {
      source: 'Vatican News',
      title: 'Santo Josemaria Escriva e lembrado como santo do trabalho ordinario',
      summary: 'A noticia mistura o santo do dia com o bloco de noticias, que deve permanecer separado no fim da pagina.',
      url: 'https://www.vaticannews.va/pt/santo/news/2026-06/santo-josemaria-escriva.html'
    },
    {
      source: 'Vatican News',
      title: 'Outra cobertura do Vaticano sobre a mesma agenda principal',
      summary: 'Este item deixa a edicao concentrada demais em uma unica fonte e empobrece a curadoria diaria.',
      url: 'https://www.vaticannews.va/pt/vaticano/news/2026-06/outra-cobertura.html'
    },
    {
      source: 'Vatican News',
      title: 'Mais uma cobertura do Vaticano repetindo o mesmo eixo editorial',
      summary: 'A automacao precisa impedir que quatro ou cinco chamadas venham do mesmo veiculo.',
      url: 'https://www.vaticannews.va/pt/vaticano/news/2026-06/mais-uma-cobertura.html'
    }
  ];

  const result = validateSelection(draft);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /at least 3 different news sources/);
  assert.match(result.errors.join('\n'), /at most 2 news items per source/);
  assert.match(result.errors.join('\n'), /saint content must stay in saint block/);
});

test('validateSelection requires Brazilian feast or solemnity title when rank is special', () => {
  const draft = structuredClone(validSelection);
  draft.liturgical.rank = 'solenidade';
  draft.liturgical.celebrationTitle = '';

  const result = validateSelection(draft);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /liturgical.celebrationTitle is required/);
});

test('buildPage uses feast or solemnity title in the liturgical color panel', () => {
  const draft = structuredClone(validSelection);
  draft.liturgical.rank = 'solenidade';
  draft.liturgical.celebrationTitle = 'Solenidade de Sao Pedro e Sao Paulo';
  draft.liturgical.cssColor = '#B21F2D';

  const html = buildPage(draft);

  assert.match(html, /Solenidade de Sao Pedro e Sao Paulo/);
  assert.doesNotMatch(html, /<strong>Tempo Comum<\/strong>/);
});

test('buildPage renders news, sponsor bar and liturgical color without internal terms', () => {
  const html = buildPage(validSelection);

  assert.match(html, /--liturgical-color: #1F6B45;/);
  assert.match(html, /Papa Leao XIV pede apoio/);
  assert.match(html, /class="sponsor-bar"/);
  assert.match(html, /Assine o @ilustre\.ai no Instagram para receber conteudos exclusivos de arte sacra, fe e inspiracao visual\./);
  assert.doesNotMatch(html, /Arte sacra personalizada por ilustre\.ai/);
  assert.doesNotMatch(html, /Curadoria em revisao|teste manual|confianca|revalidar|nao confirmado/i);
});

test('validateRenderedHtml rejects broken or unsafe output', () => {
  const badHtml = '<html><body>teste manual <a href="https://example.com">link</a></body></html>';
  const result = validateRenderedHtml(badHtml, validSelection);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /internal term/);
  assert.match(result.errors.join('\n'), /missing rel/);
});
