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
`;

  const markup = `
    <button class="story-download" type="button" id="download-story-quote">Baixar para Stories</button>
  </aside>`;

  const script = `<script>
  (function () {
    var button = document.getElementById('download-story-quote');
    if (!button) return;
    function downloadCanvas(canvas) {
      var dataUrl = canvas.toDataURL('image/png');
      window.open(dataUrl, '_blank');
    }
    function wrapStoryText(context, text, maxWidth) {
      var words = String(text || '').split(/\\s+/).filter(Boolean);
      var lines = [];
      var line = '';
      words.forEach(function (word) {
        var candidate = line ? line + ' ' + word : word;
        if (context.measureText(candidate).width <= maxWidth || !line) {
          line = candidate;
          return;
        }
        lines.push(line);
        line = word;
      });
      if (line) lines.push(line);
      return lines;
    }
    function drawStoryCard(quote, source) {
      var canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      var context = canvas.getContext('2d');
      context.fillStyle = '#F9F6F0';
      context.fillRect(0, 0, 1080, 1920);
      context.strokeStyle = 'rgba(184,148,63,0.42)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(120, 210);
      context.lineTo(960, 210);
      context.moveTo(120, 1660);
      context.lineTo(960, 1660);
      context.stroke();
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      context.fillStyle = '#1C2B4A';
      context.font = '900 74px "Playfair Display", Georgia, serif';
      var lines = wrapStoryText(context, quote, 870);
      var lineHeight = 92;
      var startY = Math.round((1920 - lines.length * lineHeight) / 2) + 20;
      lines.forEach(function (line, index) {
        context.fillText(line, 540, startY + index * lineHeight);
      });
      context.fillStyle = '#4a4040';
      context.font = '500 36px Inter, Arial, sans-serif';
      context.fillText(source, 540, startY + lines.length * lineHeight + 70);
      context.fillStyle = '#6B1A2A';
      context.font = '700 28px Inter, Arial, sans-serif';
      context.fillText('by ilustre.ai', 540, 1765);
      return canvas;
    }
    button.addEventListener('click', function () {
      var quoteElement = document.querySelector('.closing-quote-text');
      var sourceElement = document.querySelector('.closing-quote-source');
      var quote = quoteElement ? quoteElement.textContent.trim() : '';
      var source = sourceElement ? sourceElement.textContent.trim() : '';
      if (!quote) return;
      Promise.resolve(document.fonts ? document.fonts.ready : undefined)
        .then(function () { return drawStoryCard(quote, source); })
        .then(function (canvas) { downloadCanvas(canvas); })
        .catch(function () { button.textContent = 'Tente novamente'; });
    });
  })();
</script>`;

  return { css, markup, script };
}

function addStoryDownload(html, date) {
  const { css, markup, script } = storyDownloadAssets(date);
  return html
    .replace(/  \.view-counter \{[\s\S]*?  \.view-counter strong \{[\s\S]*?  \}\r?\n\r?\n/, '')
    .replace(/\n  <p class="view-counter" aria-live="polite">[\s\S]*?  <\/p>/, '')
    .replace(/<script>\s*\(function \(\) \{\s*var counter = document\.getElementById\('edition-view-count'\);[\s\S]*?<\/script>/, '')
    .replace('</style>', `${css}</style>`)
    .replace(/(<aside class="closing-quote">[\s\S]*?)\r?\n  <\/aside>/, `$1${markup}`)
    .replace('</body>', `${script}\n</body>`);
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

writeFileEnsured(candidatePath, publicHtml);
fs.copyFileSync(candidatePath, indexPath);
fs.copyFileSync(candidatePath, archivePath);
fs.unlinkSync(candidatePath);

console.log(`Published ${indexPath}`);
console.log(`Archived ${archivePath}`);
