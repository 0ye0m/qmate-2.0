/**
 * Post-build step: stamp the built bundle identity into version.json so the
 * running app can detect (and recover from) a stale-cached shell in the
 * browser. Written next to index.html; fetched with cache:'no-store'.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const m = /assets\/(index-[^"']+\.js)/.exec(html);
if (!m) throw new Error('index-*.js not found in dist/index.html');
const bundle = m[1];
const builtAt = new Date().toISOString();
writeFileSync(resolve(dist, 'version.json'), JSON.stringify({ bundle, builtAt }, null, 2) + '\n');
console.log(`[version] bundle=${bundle} builtAt=${builtAt}`);
