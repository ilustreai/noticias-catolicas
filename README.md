# Notícias Católicas Automáticas

Mini site estático diário para compartilhar nos Stories da `@ilustre.ai`.

## Como funciona

- `template/noticias-catolicas.template.html` guarda o layout fixo.
- `data/daily-selection.json` guarda o conteúdo diário.
- `scripts/validate-selection.mjs` bloqueia conteúdo fraco ou interno.
- `scripts/build-html.mjs` gera `public/index.html` e `public/YYYY-MM-DD.html`.
- `.github/workflows/daily-news.yml` roda às 04:50 no horário de Brasília quando estiver no GitHub.

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

## Regras de segurança editorial

- Publicar apenas fontes permitidas: Vatican News, Santa Sé/Vaticano, CNBB e ACI Digital.
- Exigir pelo menos 5 notícias.
- Bloquear termos internos como `teste manual`, `confiança`, `revalidar` e `não confirmado`.
- Gerar primeiro `index.candidate.html`, validar e só então substituir `index.html`.
- Manter o site estático, sem login, sem coleta de dados e sem script de anúncios.

## Monetização segura

A barra `sponsor` é opcional e vem do JSON diário. No MVP, use anúncio próprio ou parceiro católico direto. Evite redes automáticas de anúncio enquanto o tráfego for pequeno.
