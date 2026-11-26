// Builds Cauldron Chaos as one self-contained page (+ its texture worker) for hosting as an artifact.
//   node scripts/build-artifact.mjs <outDir>
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist-artifact/page';
execSync('npx vite build -c vite.artifact.config.ts', { stdio: 'inherit' });
const assets = 'dist-artifact/assets';
const files = readdirSync(assets);
const main = files.find((f) => f.startsWith('potions-') && f.endsWith('.js'));
const worker = files.find((f) => f.startsWith('texture.worker-'));
const js = readFileSync(join(assets, main), 'utf8').replace(/<\/script/gi, '<\\/script');
mkdirSync(out, { recursive: true });
// The inlined module resolves the worker against the page URL, so it sits beside the page.
copyFileSync(join(assets, worker), join(out, worker));
const html = `<meta charset="utf-8">
<title>Cauldron Chaos</title>
<style>
  :root { --night: #07060d; color-scheme: dark; }
  html, body { height: 100%; overflow: hidden; background: var(--night); touch-action: none; }
  #app { position: fixed; inset: 0; }
  canvas { display: block; }
</style>
<div id="app"></div>
<script type="module">
${js}
</script>
`;
writeFileSync(join(out, 'index.html'), html);
console.log(`wrote ${join(out, 'index.html')} (${(html.length / 1024).toFixed(0)} KB) + ${worker}`);
