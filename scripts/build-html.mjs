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
  .story-card-capture {
    position: fixed;
    left: -120vw;
    top: 0;
    width: 1080px;
    height: 1920px;
    background: var(--paper);
    color: var(--navy);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 210px 120px 155px;
    pointer-events: none;
    z-index: -1;
  }
  .story-card-rule {
    position: absolute;
    left: 120px;
    right: 120px;
    height: 3px;
    background: rgba(184,148,63,0.42);
  }
  .story-card-rule.top { top: 210px; }
  .story-card-rule.bottom { bottom: 260px; }
  .story-card-text {
    width: 100%;
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 74px;
    font-weight: 900;
    line-height: 1.24;
    text-align: center;
  }
  .story-card-source {
    margin-top: 70px;
    font-family: 'Inter', Arial, sans-serif;
    font-size: 36px;
    font-weight: 500;
    color: #4a4040;
    text-align: center;
  }
  .story-card-signature {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 155px;
    font-family: 'Inter', Arial, sans-serif;
    font-size: 28px;
    font-weight: 700;
    color: var(--wine);
    text-align: center;
  }
`;

  const markup = `
    <button class="story-download" type="button" id="download-story-quote">Baixar para Stories</button>
  </aside>

  <div class="story-card-capture" id="story-quote-card" aria-hidden="true">
    <div class="story-card-rule top"></div>
    <div class="story-card-text" id="story-quote-card-text"></div>
    <div class="story-card-source" id="story-quote-card-source"></div>
    <div class="story-card-rule bottom"></div>
    <div class="story-card-signature">by ilustre.ai</div>
  </div>`;

  const script = `<script>
  (function () {
    var button = document.getElementById('download-story-quote');
    if (!button) return;
    function downloadCanvas(canvas, filename) {
      canvas.toBlob(function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }, 'image/png');
    }
    function storyStyles() {
      return [
        '.story-card-capture{width:1080px;height:1920px;background:#F9F6F0;color:#1C2B4A;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:210px 120px 155px;position:relative;box-sizing:border-box;}',
        '.story-card-rule{position:absolute;left:120px;right:120px;height:3px;background:rgba(184,148,63,0.42);}',
        '.story-card-rule.top{top:210px;}',
        '.story-card-rule.bottom{bottom:260px;}',
        '.story-card-text{width:100%;font-family:"Playfair Display",Georgia,serif;font-size:74px;font-weight:900;line-height:1.24;text-align:center;}',
        '.story-card-source{margin-top:70px;font-family:Inter,Arial,sans-serif;font-size:36px;font-weight:500;color:#4a4040;text-align:center;}',
        '.story-card-signature{position:absolute;left:0;right:0;bottom:155px;font-family:Inter,Arial,sans-serif;font-size:28px;font-weight:700;color:#6B1A2A;text-align:center;}'
      ].join('');
    }
    function renderStoryCard(card) {
      var serialized = new XMLSerializer().serializeToString(card);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><foreignObject width="1080" height="1920"><div xmlns="http://www.w3.org/1999/xhtml"><style>' + storyStyles() + '</style>' + serialized + '</div></foreignObject></svg>';
      return new Promise(function (resolve, reject) {
        var image = new Image();
        image.onload = function () {
          var canvas = document.createElement('canvas');
          canvas.width = 1080;
          canvas.height = 1920;
          canvas.getContext('2d').drawImage(image, 0, 0);
          URL.revokeObjectURL(image.src);
          resolve(canvas);
        };
        image.onerror = function () {
          URL.revokeObjectURL(image.src);
          reject(new Error('Nao foi possivel montar a imagem do Stories.'));
        };
        image.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      });
    }
    button.addEventListener('click', function () {
      var quoteElement = document.querySelector('.closing-quote-text');
      var sourceElement = document.querySelector('.closing-quote-source');
      var card = document.getElementById('story-quote-card');
      var cardText = document.getElementById('story-quote-card-text');
      var cardSource = document.getElementById('story-quote-card-source');
      var quote = quoteElement ? quoteElement.textContent.trim() : '';
      var source = sourceElement ? sourceElement.textContent.trim() : '';
      if (!card || !cardText || !cardSource || !quote) return;
      cardText.textContent = quote;
      cardSource.textContent = source;
      Promise.resolve(document.fonts ? document.fonts.ready : undefined)
        .then(function () { return renderStoryCard(card); })
        .then(function (canvas) { downloadCanvas(canvas, 'ilustre-ai-frase-${date}.png'); })
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
