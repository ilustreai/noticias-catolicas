import fs from 'node:fs';
import path from 'node:path';
import {
  buildPage,
  readJson,
  validateRenderedHtml,
  validateSelection,
  writeFileEnsured
} from './lib.mjs';

const rootDir = process.cwd();
const dataPath = process.argv[2] ?? path.join(rootDir, 'data', 'daily-selection.json');
const outputDir = process.argv[3] ?? path.join(rootDir, 'public');
const selection = readJson(dataPath);

function storyDownloadAssets(date) {
  const css = `
  .story-download {
    margin-top: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    border: 1px solid var(--gold);
    background: transparent;
    color: var(--wine);
    padding: 0 18px;
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .story-hint {
    margin: 8px 0 0;
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    color: #999;
    text-align: center;
    letter-spacing: 0.02em;
  }
  .story-hint .three-dots {
    font-size: 16px;
    font-weight: 700;
    color: #666;
    vertical-align: middle;
  }
`;

  const markup = `
    <button class="story-download" type="button" id="download-story-quote">Baixar para Stories</button>
    <p class="story-hint">N\u00e3o funcionou? Toque em <span class="three-dots">&#x22EE;</span> e selecione <strong>Abrir no Chrome</strong></p>
  </aside>`;

  const script = `<script>
  (function () {
    var button = document.getElementById('download-story-quote');
    if (button) {
      function dataUrlToBlob(dataUrl) {
        var parts = dataUrl.split(',');
        var mime = parts[0].match(/:(.*?);/)[1];
        var bytes = atob(parts[1]);
        var buf = new Uint8Array(bytes.length);
        for (var i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
        return new Blob([buf], { type: mime });
      }
      function downloadCanvas(canvas) {
        var dataUrl = canvas.toDataURL('image/png');
        var blob = dataUrlToBlob(dataUrl);
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'ilustre-ai.png';
        document.body.appendChild(link);
        link.click();
        setTimeout(function() { document.body.removeChild(link); URL.revokeObjectURL(url); }, 1000);
      }
      function wrapStoryText(context, text, maxWidth) {
        var words = String(text || '').split(/\\s+/).filter(Boolean);
        var lines = [], line = '';
        words.forEach(function (word) {
          var candidate = line ? line + ' ' + word : word;
          if (context.measureText(candidate).width <= maxWidth || !line) {
            line = candidate; return;
          }
          lines.push(line);
          line = word;
        });
        if (line) lines.push(line);
        return lines;
      }
      function drawStoryCard(quote, source) {
        var canvas = document.createElement('canvas');
        canvas.width = 1080; canvas.height = 1920;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#F9F6F0'; ctx.fillRect(0, 0, 1080, 1920);
        ctx.strokeStyle = 'rgba(184,148,63,0.42)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(120, 210); ctx.lineTo(960, 210);
        ctx.moveTo(120, 1660); ctx.lineTo(960, 1660); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#1C2B4A';
        ctx.font = '900 74px "Playfair Display", Georgia, serif';
        var lines = wrapStoryText(ctx, quote, 870);
        var startY = Math.round((1920 - lines.length * 92) / 2) + 20;
        lines.forEach(function (l, i) { ctx.fillText(l, 540, startY + i * 92); });
        ctx.fillStyle = '#4a4040'; ctx.font = '500 36px Inter, Arial, sans-serif';
        ctx.fillText(source, 540, startY + lines.length * 92 + 70);
        ctx.fillStyle = '#6B1A2A'; ctx.font = '700 28px Inter, Arial, sans-serif';
        ctx.fillText('by ilustre.ai', 540, 1765);
        return canvas;
      }
      button.addEventListener('click', function () {
        var qt = document.querySelector('.closing-quote-text');
        var sc = document.querySelector('.closing-quote-source');
        var quote = qt ? qt.textContent.trim() : '';
        var source = sc ? sc.textContent.trim() : '';
        if (!quote) return;
        Promise.resolve(document.fonts ? document.fonts.ready : undefined)
          .then(function () { return drawStoryCard(quote, source); })
          .then(function (canvas) { downloadCanvas(canvas); })
          .catch(function () { button.textContent = 'Tente novamente'; });
      });
    }
  })();
</script>`;

  return { css, markup, script };
}

function addStoryDownload(html, date) {
  const { css, markup, script } = storyDownloadAssets(date);
  const storyJS = script.replace(/<script>\s*|\s*<\/script>/g, '').trim();
  return html
    .replace(/(<script>\s*\(function\s*\(\)\s*\{)/, '$1' + '\n' + storyJS)
    .replace('</style>', `${css}</style>`)
    .replace(/(<aside class="closing-quote">[\s\S]*?)\r?\n  <\/aside>/, `$1${markup}`);
}

const selectionResult = validateSelection(selection);
if (!selectionResult.ok) {
  console.error('Build stopped before HTML generation:');
  selectionResult.errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const html = buildPage(selection);
const htmlResult = validateRenderedHtml(html, selection);
if (!htmlResult.ok) {
  console.error('Build stopped before publication:');
  htmlResult.errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const publicHtml = addStoryDownload(html, selection.date);

const candidatePath = path.join(outputDir, 'index.candidate.html');
const indexPath = path.join(outputDir, 'index.html');
const archivePath = path.join(outputDir, `${selection.date}.html`);

const assetsDir = path.join(rootDir, 'assets');
const publicAssetsDir = path.join(outputDir, 'assets');
if (fs.existsSync(assetsDir)) {
  fs.mkdirSync(publicAssetsDir, { recursive: true });
  fs.readdirSync(assetsDir).forEach((file) => {
    const src = path.join(assetsDir, file);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(publicAssetsDir, file));
    }
  });
}

writeFileEnsured(candidatePath, publicHtml);
fs.copyFileSync(candidatePath, indexPath);
fs.copyFileSync(candidatePath, archivePath);
fs.unlinkSync(candidatePath);

console.log(`Published ${indexPath}`);
console.log(`Archived ${archivePath}`);
