import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');
const runtimeRoot = join(root, 'public/game-runtimes/sylvaria-sequoia');
const manifestPath = join(runtimeRoot, 'runtime-manifest.json');

export function buildSylvariaRuntime({ write = true } = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.version, '0.6.2', 'runtime manifest version must match v0.6.2');
  assert.equal(manifest.bundle, 'runtime.bundle.js', 'runtime bundle filename drifted');
  assert.ok(Array.isArray(manifest.modules) && manifest.modules.length >= 30, 'runtime manifest is unexpectedly small');
  assert.equal(new Set(manifest.modules).size, manifest.modules.length, 'runtime manifest contains duplicate modules');

  let sourceBytes = 0;
  const pieces = [];
  for (const name of manifest.modules) {
    assert.match(name, /^[0-9]{2}-[a-z0-9-]+(?:-v\d+)?\.js$/i, `unsafe runtime module path: ${name}`);
    const path = join(runtimeRoot, name);
    assert.ok(existsSync(path), `missing runtime module: ${name}`);
    const source = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
    sourceBytes += Buffer.byteLength(source);
    pieces.push(`;\n/* ${name} */\n${source.trim()}\n`);
  }

  const banner = `/* Sylvaria: Sequoia v${manifest.version} · generated from runtime-manifest.json · do not edit */\n`;
  const bundle = `${banner}${pieces.join('\n')}`;
  const bundleBytes = Buffer.byteLength(bundle);
  const brotli = brotliCompressSync(Buffer.from(bundle), {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
    },
  });
  const brotliBytes = brotli.byteLength;
  const sha256 = createHash('sha256').update(bundle).digest('hex');

  assert.ok(sourceBytes <= Number(manifest.sourceBudgetBytes), `Sylvaria source budget exceeded: ${sourceBytes} > ${manifest.sourceBudgetBytes}`);
  assert.ok(brotliBytes <= Number(manifest.brotliBudgetBytes), `Sylvaria Brotli budget exceeded: ${brotliBytes} > ${manifest.brotliBudgetBytes}`);

  const meta = {
    version: manifest.version,
    bundle: manifest.bundle,
    sha256,
    moduleCount: manifest.modules.length,
    sourceBytes,
    bundleBytes,
    brotliBytes,
    sourceBudgetBytes: Number(manifest.sourceBudgetBytes),
    brotliBudgetBytes: Number(manifest.brotliBudgetBytes),
  };

  if (write) {
    writeFileSync(join(runtimeRoot, manifest.bundle), bundle);
    writeFileSync(join(runtimeRoot, 'runtime.bundle.meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  }
  return { manifest, bundle, meta };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const result = buildSylvariaRuntime({ write: !process.argv.includes('--check') });
  console.log(JSON.stringify(result.meta, null, 2));
}
