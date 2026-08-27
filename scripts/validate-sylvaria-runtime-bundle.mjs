import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSylvariaRuntime } from './build-sylvaria-runtime.mjs';

const root = process.cwd();
const runtimeRoot = join(root, 'public/game-runtimes/sylvaria-sequoia');
const index = readFileSync(join(runtimeRoot, 'index.html'), 'utf8');
const { manifest, bundle, meta } = buildSylvariaRuntime({ write: false });

assert.equal(manifest.version, '0.6.2');
assert.equal(meta.moduleCount, manifest.modules.length);
assert.equal(new Set(manifest.modules).size, manifest.modules.length);
assert.ok(meta.sourceBytes <= manifest.sourceBudgetBytes, `source budget exceeded: ${meta.sourceBytes}`);
assert.ok(meta.brotliBytes <= manifest.brotliBudgetBytes, `Brotli budget exceeded: ${meta.brotliBytes}`);
assert.match(meta.sha256, /^[a-f0-9]{64}$/);
assert.match(bundle, /mastery-lab-v1/);
assert.match(bundle, /nearest-sap-authority-v3/);
assert.match(bundle, /run-recap-v2/);

const position = (name) => {
  const index = manifest.modules.indexOf(name);
  assert.notEqual(index, -1, `missing ${name} from runtime manifest`);
  return index;
};
assert.ok(position('02-canopy-economy.js') < position('02-canopy-director.js'));
assert.ok(position('02-canopy-director.js') < position('02-mastery-lab.js'));
assert.ok(position('02-mastery-lab.js') < position('02-sap-authority-v2.js'));
assert.ok(position('03-economy-input-guard.js') < position('03-run-recap-hud.js'));
assert.ok(position('03-run-recap-hud.js') < position('04-input.js'));

assert.match(index, /runtime\.bundle\.js\?v=062-mastery/);
assert.equal((index.match(/<script src="\.\/runtime\.bundle\.js/g) || []).length, 1, 'runtime bundle should load exactly once');
for (const name of manifest.modules) {
  assert.doesNotMatch(index, new RegExp(`<script src="\\./${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `authoring module ${name} is still loaded separately`);
}

console.log(JSON.stringify({
  ok: true,
  version: manifest.version,
  delivery: 'single deterministic runtime bundle + CDN Brotli',
  ...meta,
}, null, 2));
