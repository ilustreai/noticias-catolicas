# Noticias Catolicas Automaticas

Mini site estatico diario para compartilhar nos Stories da `@ilustre.ai`.

## Como funciona

- `template/noticias-catolicas.template.html` guarda o layout fixo.
- `data/daily-selection.json` guarda o conteudo diario.
- `scripts/validate-selection.mjs` bloqueia conteudo fraco, interno ou mal distribuido.
- `scripts/build-html.mjs` gera `public/index.html` e `public/YYYY-MM-DD.html`.
- `.github/workflows/daily-news.yml` roda as 04:50 no horario de Brasilia quando estiver no GitHub.

## Rodar localmente

```powershell
npm.cmd test
npm.cmd run validate
npm.cmd run build
```

Depois abra:

```text
public/index.html
```

## Regras de seguranca editorial

- Publicar de 5 a 8 noticias, sempre com pelo menos 3 fontes diferentes.
- Usar no maximo 2 noticias da mesma fonte.
- Exigir pelo menos 2 itens oficiais do Vaticano ou Santa Se.
- Exigir pelo menos 1 item da Igreja no Brasil, inicialmente via CNBB.
- Exigir pelo menos 2 itens de veiculos catolicos confiaveis, como ACI Digital, Cancao Nova ou Shalom.
- Manter o santo do dia fora da lista de noticias; ele aparece no bloco final proprio.
- Bloquear links repetidos e termos internos como `teste manual`, `confianca`, `revalidar` e `nao confirmado`.
- Gerar primeiro `index.candidate.html`, validar e so entao substituir `index.html`.
- Manter o site estatico, sem login, sem coleta de dados e sem script de anuncios.

## Liturgia e cores

- A edicao inicial segue o calendario liturgico do Brasil: `liturgical.country` deve ser `BR`.
- `liturgical.rank` aceita `tempo`, `memoria`, `festa` ou `solenidade`.
- Em `memoria`, `festa` ou `solenidade`, `liturgical.celebrationTitle` e obrigatorio e aparece no painel de cor liturgica.
- A cor vem de `liturgical.cssColor`, permitindo branco/dourado, verde, vermelho, roxo ou rosa conforme o dia.

## Monetizacao segura

A barra `sponsor` e opcional e vem do JSON diario. No MVP, use anuncio proprio ou parceiro catolico direto. Evite redes automaticas de anuncio enquanto o trafego for pequeno.
