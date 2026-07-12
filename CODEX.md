# Notícias Católicas — Manual do Codex

## 1. O QUE É

Newsletter católica diária gerada por automação com **duas edições/dia** (00:01 e 12:00 BRT). O sistema coleta notícias de feeds RSS, seleciona as melhores, enriquece os resumos, e publica uma página HTML estática via GitHub Actions + GitHub Pages.

Domínio: `https://noticias.ilustreai.com.br` (CNAME aponta para `ilustreai.github.io/noticias-catolicas`)

---

## 2. ARQUITETURA VISÃO GERAL

```
[Feeds RSS] → generate-daily-selection.mjs → data/daily-selection.json
                                                         ↓
data/daily-selection.json → build-html.mjs → index.html + public/*.html
                                                         ↓
                                              GitHub Actions faz commit
                                              GitHub Pages faz deploy
```

### Duas edições por dia

| Edição | Horário (UTC) | Horário (BRT) | Faz refresh do cache litúrgico? | Carrega previous selection? |
|--------|---------------|----------------|--------------------------------|-----------------------------|
| 1ª     | 03:01         | 00:01          | Sim                            | Não                         |
| 2ª     | 15:00         | 12:00          | Não (cache já existe)          | Sim (filtra duplicatas)     |

**Workflow** em `.github/workflows/daily-news.yml`:
- Job `edition1`: schedule cron `1 3 * * *` (03:01 UTC)
- Job `edition2`: schedule cron `0 15 * * *` (15:00 UTC)
- Ambos no grupo `catholic-news-publish` (concorrência, cancel-in-progress)

---

## 3. ESTRUTURA DE ARQUIVOS

```
scripts/
  lib.mjs                           — Núcleo: validação, renderização, helpers
  generate-daily-selection.mjs      — Geração: coleta feeds, seleciona, enriquece
  build-html.mjs                    — Build: lê JSON, gera HTML, escreve arquivos
  validate-selection.mjs            — Validação CLI do daily-selection.json
  polish-selection.mjs              — Corrige ortografia PT-BR + remove resíduos RSS
  refresh-liturgical-cache.mjs      — Atualiza cache litúrgico (santo, evangelho, cor)
template/
  noticias-catolicas.template.html   — Template HTML com placeholders {{TOKEN}}
tests/
  automation.test.mjs               — 18 testes: validação, build, render, segurança
  telegram-control.test.mjs         — Testes do bot Telegram
data/
  daily-selection.json              — Seleção atual (gerada por generate-daily-selection)
  liturgical-calendar-2026.json     — Cache litúrgico anual
  news-sources.json                 — Config das fontes de notícias
public/                             — Arquivos históricos (YYYY-MM-DD-{1|2}.html)
.github/workflows/
  daily-news.yml                    — Workflow principal (duas edições agendadas)
  build-from-selection.yml          — Rebuild manual ou por push em paths específicos
workers/
  telegram-control/                 — Cloudflare Worker para bot do Telegram
```

### Fluxo dos arquivos

1. `generate-daily-selection.mjs` → escreve `data/daily-selection.json`
2. `build-html.mjs` ← lê `data/daily-selection.json` → escreve `index.html` e `public/YYYY-MM-DD-{1|2}.html`
3. Workflow commita `data/daily-selection.json`, `index.html` e `public/index.html`
4. GitHub Pages faz deploy automático do branch `main`

---

## 4. SCRIPTS EM DETALHE

### 4.1 `scripts/lib.mjs` — O coração

Exports principais:

| Função | O que faz |
|--------|-----------|
| `escapeHtml()` | Sanitiza HTML |
| `validateSelection(selection)` | Valida o JSON inteiro (18 regras) |
| `buildPage(selection, template)` | Substitui placeholders no template e retorna HTML |
| `validateRenderedHtml(html, selection)` | Valida o HTML gerado |
| `readJson(filePath)` | Lê JSON com try/catch implícito |
| `writeFileEnsured(filePath, content)` | Escreve arquivo criando diretórios |

**Regras de validação** (`validateSelection`):
- Date deve ser YYYY-MM-DD
- editionLabel obrigatório
- liturgical.country deve ser "BR"
- liturgical.rank deve ser tempo|memoria|festa|solenidade
- Se rank for memoria/festa/solenidade, celebrationTitle é obrigatório
- liturgical.cssColor deve ser hex #RRGGBB
- 5 a 8 news items
- No máximo 2 notícias por source
- No mínimo 3 fontes diferentes
- No mínimo 2 Vatican News
- No mínimo 1 CNBB
- No mínimo 2 trusted Catholic (ACI Digital, Canção Nova, Shalom, Aleteia, Gaudium Press)
- Titles ≥ 24 chars, summaries ≥ 40 chars
- URLs devem ser HTTPS e não ser homepage/menu
- Sem resíduo editorial (Continue lendo, &#8594;, etc.)
- Conteúdo de santo não pode vazar para notícias
- Sem termos internos (teste manual, não confirmado, etc.)
- Sponsor opcional, se habilitado precisa label + text + url HTTPS

**Helpers**:
- `normalizeText()` → NFD + lowercase + remove acentos
- `sourceKey()` → chave normalizada para comparação
- `saintNameTokens()` → extrai tokens ≥ 6 chars do nome do santo, excluindo palavras comuns
- `looksLikeSaintContent()` → true se ≥ 2 tokens do santo aparecem no texto
- `isLightColor()` → decide se cor litúrgica é clara (adiciona classe `liturgy-light`)
- `editionTag()` → extrai "1°ed" ou "2°ed" do editionLabel
- `simplifyGospelRef()` → limpa referência do evangelho
- `liturgicalDisplayTitle()` → romanToArabic + formatWeekTitle

**Placeholders do template** (`buildPage` substitui):
```
{{LITURGICAL_COLOR}}        {{SAINT_NAME}}
{{LITURGICAL_TEXT_MODIFIER}} {{SAINT_DESCRIPTION}}
{{EDITION_DATE}}            {{SAINT_MORE_LINK}}
{{PAGE_TITLE}}              {{GOSPEL_REF}}
{{HERO_EYEBROW}}            {{GOSPEL_LINES}}
{{LITURGICAL_SEASON}}        {{GOSPEL_LINK}}
{{GOSPEL_SHORT}}            {{NEWS_ITEMS}}
{{EDITION_LABEL}}           {{CLOSING_QUOTE_TEXT}}
{{EDITION_TAG}}             {{CLOSING_QUOTE_SOURCE}}
                            {{SPONSOR_BAR}}
```

### 4.2 `scripts/generate-daily-selection.mjs` — A geração

**Variáveis de ambiente**:
- `SELECTION_DATE` — força data (YYYY-MM-DD) para testes locais
- `EDITION` — "1" ou "2" (default "1")
- `OPENAI_API_KEY` — opcional, ativa seleção por IA

**Fluxo completo**:

1. **Determina data** (`todayInSaoPaulo`): se `SELECTION_DATE` setado, usa ele. Senão, calcula `America/Sao_Paulo`

2. **Carrega fontes** de `data/news-sources.json`

3. **Para cada fonte, coleta itens**:
   - Se fonte tem `feedUrl`, chama `fetchFeed()` → parse XML RSS
   - Se fonte tem `pageUrls[]`, chama `fetchPage()` → parse HTML por regex de `<a>` tags
   - Se não retornar nada, usa `fallbackItemsBySource[source]`

4. **Fallback items** por source (hardcoded no script):
   - CNBB: 3 fallbacks (paz, palio, pastoral familiar)
   - Vatican News: 3 fallbacks (papa, sao pedro, consistorio)
   - ACI Digital: 2 fallbacks (mes vocacional, santuarios)
   - Aleteia: 1 fallback (oracao e jejum)
   - Essential: fallbacks NÃO têm campo `published` (não são filtrados por idade)

5. **Normaliza e limpa**:
   - `makeTitle()` → remove prefixos, data/hora, source name
   - `makeSummary()` → remove HTML, resíduo editorial, verifica se é igual ao title
   - Se summary muito curto, tenta `enrichSummaries()` (fetch da URL original)

6. **Deduplica** (`uniqueItems()`): por URL + título normalizado (80 primeiros caracteres)

7. **Edição 2 carrega previous selection** (`loadPreviousSelection()`):
   - Lê `data/daily-selection.json` do commit anterior
   - Extrai URLs e títulos

8. **Filtra repetidos** (`isRepeat()`): se o item tem URL ou título que já apareceu na edição anterior, descarta

9. **Scoreia** (`scoreNewsCandidate()`):
   - +40 Vatican, +34 CNBB, +30 trusted
   - Hot terms: papa(+22), leao xiv(+20), vaticano(+16), consistorio(+16), etc.
   - Freshness: 50 - (age² × 12), penalidade se sem published
   - Bônus: +10 vatican kind, +8 brazil kind, +6 trusted kind

10. **Seleciona** (`deterministicSelection()`):
    - Picks: 2 vatican → 1 brazil → 2 trusted → resto
    - No máximo 2 por source
    - No máximo 2 por topic cluster (papa, vaticano, mundo, social, brasil)

11. **Safety nets**:
    - `forceValidSelection()`: se validação falhar por falta de fontes obrigatórias, injeta fallbacks substituindo duplicatas
    - `injectMinimumFallback()`: se mesmo assim candidates < 5, injeta fallbacks até ter 5
    - `repairSaintContentNews()`: remove notícias que vazam conteúdo de santo, substitui por outras

12. **Enriquece summaries** (`enrichSummaries()`):
    - Fetch da URL original, extrai primeiros parágrafos do `<article>`/`<main>`
    - Filtro promocional: remove ">> Clique", "Inscreva-se", "WhatsApp", etc.
    - Max 500 chars, corta na última frase

13. **Seleção por IA** (opcional, se `OPENAI_API_KEY` presente):
    - Chama GPT-4o-mini com schema JSON
    - Se falhar, cai no algoritmo determinístico

14. **Atribui closing quote** (`pickClosingQuote()`):
    - Prioridade: closingQuote do cache litúrgico → fallback ligado ao santo → fallback ligado ao evangelho → genérico "Fazei tudo por amor."

15. **Salva** `data/daily-selection.json`

### 4.3 `scripts/build-html.mjs` — O build

Lê `data/daily-selection.json`, chama `buildPage()`, valida, escreve:
- `index.html` (raiz — usada pelo GitHub Pages)
- `public/YYYY-MM-DD-{1|2}.html` (arquivo histórico)
- `public/index.html` (cópia para deploy)

Também adiciona:
- CSS/HTML/JS do "Baixar para Stories" (canvas quote card)
- Remove o view counter padrão (era da versão anterior)

Variáveis de ambiente: `EDITION` ("1" ou "2") para nome do arquivo archive.

### 4.4 `scripts/polish-selection.mjs` — Corretor ortográfico

Aplica 59 regex de correção PT-BR no JSON inteiro:
- Noticias → Notícias, Voce → Você, Sao → São, fe → fé, etc.
- Remove Continue lendo, L'articolo, O post ... apareceu primeiro
- Filtra notícias com placar/jogo/classificação garantida (conteúdo esportivo)
- Decodifica entidades HTML
- Executa `validateSelection()` no final

### 4.5 `scripts/validate-selection.mjs` — CLI de validação

Lê um JSON (padrão: `data/daily-selection.json`), chama `validateSelection()`, exit code 0 se ok, 1 se falhar.

### 4.6 `scripts/refresh-liturgical-cache.mjs`

Atualiza `data/liturgical-calendar-2026.json` (dados litúrgicos do ano: santo, evangelho, cor litúrgica, estação). Executado apenas na 1ª edição do dia.

---

## 5. TEMPLATE HTML (`template/noticias-catolicas.template.html`)

Arquivo único com ~556 linhas. Contém:

### Estrutura

```
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <style> ... CSS completo inline ... </style>
</head>
<body>
  <header class="masthead">             ← Sticky, muda de cor no scroll
    <a class="masthead-brand">newsletter • ilustre.ai</a>
    <span class="masthead-date">{{EDITION_LABEL}}</span>
    <span class="masthead-edition">{{EDITION_TAG}}</span>
  </header>

  <section class="hero">                ← Título principal + scroll transition
    <h1 class="hero-title">Uma <em>pausa</em> antes do mundo acelerar</h1>
  </section>

  <div class="liturgy-strip">           ← Barra de cor litúrgica (volume: box-shadow inset)
    grid 2 colunas: Tempo Litúrgico | Evangelho do Dia
  </div>

  <main>
    <div class="saint-card">            ← Santo do dia
    <div class="gospel-card">           ← Evangelho
    <div class="news-feed">             ← 5-8 notícias
    <aside class="closing-quote">       ← Frase de encerramento
    <aside class="sponsor-bar">         ← Apoio/patrocínio
  </main>

  <footer>
  <script> ... IntersectionObserver (scroll + reveal) ... </script>
</body>
```

### Partes que você pode querer alterar

- **Hero**: `hero-title` com `Uma *pausa* antes do mundo acelerar` (Playfair Display 900, gold italic)
- **Scroll transition**: `.masthead` e `.hero` mudam de `--navy` para `--liturgical-color` via IntersectionObserver
- **Reveal cards**: notícias aparecem com fade-in + translateY ao scroll (threshold 0.15, staggered delays)
- **Barra litúrgica**: `--liturgical-color` dinâmico, com `box-shadow: inset` para volume
- **Masthead**: sticky, com `.scrolled` class que muda cor de fundo
- **Botão Stories**: canvas que gera quote card para download

### Sistema de cores

```css
--navy: #1C2B4A;        /* fundo hero/masthead */
--liturgical-color: ...; /* dinâmico, vem do JSON */
--gold: #B8943F;
--gold-lt: #D4AF6A;
--wine: #6B1A2A;
--paper: #F9F6F0;
```

---

## 6. WORKFLOWS GITHUB ACTIONS

### 6.1 `daily-news.yml` — Principal

```yaml
on:
  schedule:
    - cron: '1 3 * * *'   # 00:01 BRT — 1ª edição
    - cron: '0 15 * * *'  # 12:00 BRT — 2ª edição
  workflow_dispatch:       # trigger manual
```

Jobs (condicionais por schedule):
- `edition1`: roda refresh cache + generate + validate + build + smoke check + commit + push
- `edition2`: NÃO roda refresh cache, carrega previous selection para dedup, NÃO faz smoke check de site público

Congregação: `catholic-news-publish` com `cancel-in-progress: true`

### 6.2 `build-from-selection.yml` — Rebuild por push

Triggers:
- `workflow_dispatch` (manual)
- `push` nos paths: `data/daily-selection.json`, `scripts/build-html.mjs`, `scripts/lib.mjs`, `template/noticias-catolicas.template.html`

Passos:
1. `npm test` — executa todos os 18 testes
2. `npm run validate` — valida o JSON
3. Build + cópia para public/
4. Smoke check: sem Continue lendo, &#8594;, O post..., placar, classificação garantida
5. Commit + push

**IMPORTANTE**: se o commit alterar apenas o YAML do workflow, ele mesmo NÃO triggera (o YAML não está nos `paths`)

---

## 7. TESTES (`tests/automation.test.mjs`)

18 testes que cobrem:

| Teste | O que verifica |
|-------|---------------|
| escapeHtml | Injeção HTML |
| validateSelection (5 testes) | Completo, interno, diversidade, resíduo RSS, homepage URL, feast title |
| buildPage (2 testes) | Cor litúrgica, termos internos, sponsor |
| buildPage view counter | localStorage + edition-view-count |
| validateRenderedHtml (2 testes) | Broken HTML, contract sem título frágil |

Rodar: `npm test`

---

## 8. WORKER TELEGRAM (`workers/telegram-control/`)

Cloudflare Worker em `index.mjs` que expõe comandos:
- `/daily` — dispara workflow daily-news.yml
- `/rebuild` — dispara build-from-selection.yml (contingência)
- `/status` — verifica status do último run + site público
- `/test` — verifica site público + JSON remoto sem disparar

Autenticação: verifica se o chat_id está na lista autorizada.

---

## 9. PADRÕES E CONVENÇÕES PARA ALTERAÇÕES

### Como o Codex deve agir

1. **Leia o CODEX.md primeiro** (este arquivo) para entender o sistema.
2. **NUNCA adicione comentários** ao código (nem JS, nem CSS, nem HTML).
3. **Explore o código existente** antes de escrever qualquer alteração — entenda os padrões.
4. **Testes**: após qualquer alteração, rode `npm test` e garanta 18/18.

### Ao fazer alterações no template

- Arquivo: `template/noticias-catolicas.template.html`
- Para testar: gere selection com `$env:EDITION='1'; node scripts/generate-daily-selection.mjs`, depois build com `node scripts/build-html.mjs data/daily-selection.json .`
- Lembre-se: o template está em um arquivo SÓ com CSS inline + HTML + JS inline
- Placeholders são no formato `{{TOKEN}}` — substituídos por `buildPage()` em `lib.mjs`
- Se criar novo placeholder, adicione em `lib.mjs` → `buildPage()` → objeto `replacements`
- O active class no masthead/hero é `.scrolled` (IntersectionObserver)
- O reveal das notícias é `.reveal.visible` (IntersectionObserver)

### Ao fazer alterações no generate

- Arquivo: `scripts/generate-daily-selection.mjs`
- Adicione novos hot terms em `scoreNewsCandidate()` se quiser priorizar novos tópicos
- Adicione novos fallbacks em `fallbackItemsBySource` para garantir resiliência
- Se adicionar novo campo no JSON de saída, atualize `buildPage()` em `lib.mjs`
- A estrutura do JSON de saída: date, editionLabel, liturgical, saint, gospel, sponsor, news[], closingQuote

### Ao fazer alterações no build

- Arquivo: `scripts/build-html.mjs`
- Nome do archive: `${selection.date}-${edition}.html`
- O output `index.html` na raiz é o que o GitHub Pages serve
- O output `public/index.html` é cópia para deploy

### Ao adicionar testes

- Arquivo: `tests/automation.test.mjs`
- Use `node:test` (built-in) com `assert` do Node
- Crie fixtures realistas no estilo `validSelection`
- Teste validação (casos ok e fail) e renderização

### Ao fazer alterações no workflow

- Arquivos: `.github/workflows/daily-news.yml` e `build-from-selection.yml`
- O `build-from-selection.yml` NÃO triggera se só o YAML mudar (ver paths)
- Ambos compartilham o grupo `catholic-news-publish`
- Se adicionar passos, lembre de `git pull --rebase` antes do push

---

## 10. VARIÁVEIS DE AMBIENTE

| Variável | Onde | Uso |
|----------|------|-----|
| `SELECTION_DATE` | Local | Força data para teste: `2026-07-11` |
| `EDITION` | Local + Workflow | "1" ou "2" |
| `OPENAI_API_KEY` | Local + Workflow | Ativa seleção por IA (gpt-4o-mini) |
| `OPENAI_MODEL` | Local + Workflow | Modelo OpenAI (default gpt-4o-mini) |
| `TELEGRAM_BOT_TOKEN` | Workflow | Notificação de falha |
| `TELEGRAM_CHAT_ID` | Workflow | Chat para notificação |

---

## 11. COMO O AI CONSEGUE COMMITAR

O ambiente local (PowerShell no Windows) tem o **git credential manager** configurado com as credenciais do `ilustreai` no GitHub. Por isso eu consigo rodar `git add`, `git commit`, `git pull --rebase` e `git push` sem pedir senha.

**Importante para o Codex**: quando você precisar commitar:

1. **Sempre verifique o diretório**: use `git -C "C:\Users\Cliente\Documents\Codex\2026-06-26\consa-novo"` ou garanta que o working directory está correto com `workdir`
2. **Faça `git pull --rebase` antes do push** para evitar rejeição por commits concorrentes (o workflow também commita)
3. **Use `git add` com paths EXPLÍCITOS** — nunca `git add .` ou `git add -A`
4. **Se houver unstaged changes** (ex: `data/daily-selection.json` modificado pelo generate), faça `git stash` antes do rebase e `git stash drop` depois
5. **Sequência segura**:
   ```powershell
   git add <arquivos-específicos>
   git commit -m "feat: descrição"
   git stash                              # se houver sujeira no working tree
   git pull --rebase
   git stash drop                         # ou git stash pop se quiser restaurar
   git push
   ```
6. **Se o push falhar com "fetch first"**, é porque o remote avançou — repita o ciclo `pull --rebase` + `push`

**Nota**: o usuário pode reautenticar com `git credential-manager` se as credenciais expirarem.

## 12. COMANDOS ÚTEIS

```bash
# Gerar selection (edição 1)
$env:SELECTION_DATE='2026-07-11'; $env:EDITION='1'; node scripts/generate-daily-selection.mjs

# Gerar selection (edição 2)
$env:SELECTION_DATE='2026-07-11'; $env:EDITION='2'; node scripts/generate-daily-selection.mjs

# Build HTML
node scripts/build-html.mjs data/daily-selection.json .

# Validar JSON
npm run validate

# Testar
npm test

# Corrigir ortografia
node scripts/polish-selection.mjs
```

---

## 13. AGENTES SUGERIDOS

Para tarefas isoladas, crie agentes separados:

### Agente: Template Designer
**Arquivos**: `template/noticias-catolicas.template.html`
**Responsabilidades**: 
- Alterar layout, cores, fontes, espaçamento
- Adicionar/remover seções do template
- Manipular placeholders `{{TOKEN}}`
- Adicionar CSS e JS inline
**Contexto**: leia o template inteiro + a seção 9 deste CODEX.md

### Agente: Backend / Automation
**Arquivos**: `scripts/generate-daily-selection.mjs`, `scripts/lib.mjs`
**Responsabilidades**:
- Adicionar novas fontes de notícias
- Ajustar sistema de scoring/seleção
- Adicionar/melhorar validações
- Corrigir bugs de parsing RSS
**Contexto**: leia os scripts + sections 4.1, 4.2, 9 deste CODEX.md

### Agente: DevOps / Workflows
**Arquivos**: `.github/workflows/*.yml`
**Responsabilidades**:
- Alterar schedules
- Adicionar/mover passos nos workflows
- Modificar concurrency, triggers, secrets
**Contexto**: leia os YAMLs + sections 6, 9 deste CODEX.md

### Agente: Testes
**Arquivos**: `tests/*.test.mjs`
**Responsabilidades**:
- Adicionar novos testes
- Corrigir testes quebrados
- Criar fixtures
**Contexto**: leia os testes + section 9 deste CODEX.md

### Agente: Telegram Bot
**Arquivos**: `workers/telegram-control/`
**Responsabilidades**:
- Adicionar/alterar comandos
- Modificar lógica de autorização
- Alterar mensagens
**Contexto**: leia os workers + section 8 deste CODEX.md

---

## 14. GOTCHAS E REGRAS IMPORTANTES

1. **Workflow YAML não triggera ele mesmo** — se mudar paths, o trigger não acontece. Use `workflow_dispatch` manual.
2. **`data/daily-selection.json` é sobrescrito toda geração** — não editar manualmente (a não ser para testes).
3. **Fallbacks não têm `published`** — se tivessem, seriam filtrados por idade e perderiam o propósito.
4. **Edição 2 carrega `data/daily-selection.json` do commit anterior** — como o workflow commita antes de terminar, a edição 2 sempre vê a edição 1 como "previous".
5. **`npm test` é executado no workflow antes do build** — se falhar, o build não acontece.
6. **Liturgical color para cores claras** (luminance > 180) recebe classe `liturgy-light` que ajusta texto e bordas para contraste com fundo escuro.
7. **O `makeSummary()`** tenta evitar summaries idênticos ao título, mas tem edge cases.
8. **`saintNameTokens()`** exclui tokens < 6 chars e palavras comuns (bento, pedro, paulo, maria, igreja, cristo, etc.) para evitar falsos positivos em "looksLikeSaintContent".
9. **O `build-from-selection.yml`** requer que `data/daily-selection.json` já exista com dados válidos.
10. **Concorrência**: `daily-news.yml` usa `catholic-news-publish` (job edition1 e edition2 não concorrem entre si). `build-from-selection.yml` usa `catholic-news-rebuild` separado — rebuild manuais NÃO cancelam a execução agendada.
11. **Sponsor** fixo no código (Instagram @ilustre.ai) — não vem do JSON de fontes.
12. **Todas as URLs externas** devem ter `target="_blank"` e `rel="noopener noreferrer"` (validado em `validateRenderedHtml`).
