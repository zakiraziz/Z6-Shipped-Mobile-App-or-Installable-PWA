import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bump the service-worker cache VERSION so activate() garbage-collects the
 * old cache. Run when icons / manifest / anything precached changed:
 *   npm run bump:cache
 */
const swPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sw.js');
const source = readFileSync(swPath, 'utf8');
const match = source.match(/const VERSION = 'v(\d+)';/);

if (!match) {
  console.error('VERSION constant not found in public/sw.js');
  process.exit(1);
}

const next = Number(match[1]) + 1;
writeFileSync(swPath, source.replace(/const VERSION = 'v\d+';/, `const VERSION = 'v${next}';`));
console.log(`Service-worker cache version bumped: v${match[1]} → v${next}`);
