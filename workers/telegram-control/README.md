# Telegram Control Worker

Controle remoto por Telegram para a automacao do site Noticias Catolicas.

## Funcoes

- `/menu`: mostra botoes de controle.
- `/rodar`: dispara o workflow `daily-news.yml`.
- `/contingencia`: dispara o workflow `build-from-selection.yml`.
- `/status`: mostra estado do site e ultimo workflow.
- `/relatorio`: mostra status com link do ultimo run.
- `/erro`: mostra o ultimo erro recente.
- `/teste`: confere site publico, JSON remoto e ultimo workflow sem publicar.

## Secrets Necessarios

Configure no Cloudflare Worker:

- `TELEGRAM_BOT_TOKEN`: token do BotFather.
- `TELEGRAM_CHAT_ID`: seu chat id autorizado.
- `TELEGRAM_WEBHOOK_SECRET`: segredo aleatorio para validar chamadas do Telegram.
- `GITHUB_TOKEN`: fine-grained PAT com acesso ao repo `ilustreai/noticias-catolicas`.

Permissoes do GitHub token:

- Repository access: somente `ilustreai/noticias-catolicas`.
- Contents: read and write.
- Actions: read and write.
- Metadata: read-only.

## Vars

Copie `wrangler.toml.example` para `wrangler.toml` e mantenha:

- `GITHUB_OWNER=ilustreai`
- `GITHUB_REPO=noticias-catolicas`
- `GITHUB_REF=main`
- `PUBLIC_SITE_URL=https://noticias.ilustreai.com.br/`

## Deploy

```powershell
cd workers\telegram-control
copy wrangler.toml.example wrangler.toml
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

## Webhook do Telegram

Depois do deploy, configure o webhook:

```powershell
$botToken = "COLE_TELEGRAM_BOT_TOKEN"
$workerUrl = "https://telegram-ilustre-control.SEU_SUBDOMINIO.workers.dev/"
$secret = "COLE_O_MESMO_TELEGRAM_WEBHOOK_SECRET"
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/setWebhook" -Body @{
  url = $workerUrl
  secret_token = $secret
}
```

Depois envie `/menu` no Telegram.
