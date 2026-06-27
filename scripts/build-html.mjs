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

const candidatePath = path.join(outputDir, 'index.candidate.html');
const indexPath = path.join(outputDir, 'index.html');
const archivePath = path.join(outputDir, `${selection.date}.html`);

writeFileEnsured(candidatePath, html);
fs.copyFileSync(candidatePath, indexPath);
fs.copyFileSync(candidatePath, archivePath);
fs.unlinkSync(candidatePath);

console.log(`Published ${indexPath}`);
console.log(`Archived ${archivePath}`);
