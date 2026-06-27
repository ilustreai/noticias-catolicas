import path from 'node:path';
import { readJson, validateSelection } from './lib.mjs';

const target = process.argv[2] ?? path.join('data', 'daily-selection.json');
const selection = readJson(target);
const result = validateSelection(selection);

if (!result.ok) {
  console.error('Selection validation failed:');
  result.errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Selection validation passed: ${selection.date}`);
