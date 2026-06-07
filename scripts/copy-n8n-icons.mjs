/**
 * Optional: copy official n8n node SVGs from n8n-nodes-base into public/n8n-icons/.
 * Run after: npm i -D n8n-nodes-base
 * Fallback SVGs are already committed for core node types.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(root, 'node_modules', 'n8n-nodes-base', 'dist', 'nodes');
const dest = join(root, 'public', 'n8n-icons');

if (!existsSync(srcRoot)) {
  console.log('n8n-nodes-base not installed — using committed fallback SVGs in public/n8n-icons/');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
let count = 0;

for (const dir of readdirSync(srcRoot, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const folder = join(srcRoot, dir.name);
  for (const file of readdirSync(folder)) {
    if (file.endsWith('.svg')) {
      cpSync(join(folder, file), join(dest, file), { force: true });
      count++;
    }
  }
}

console.log(`Copied ${count} n8n SVG icons → public/n8n-icons/`);
