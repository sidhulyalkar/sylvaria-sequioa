import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('standalone repository preserves the proven v0.6.2 extraction boundary', () => {
  const provenance = JSON.parse(read('provenance.json'));
  const manifest = JSON.parse(read('public/game-runtimes/sylvaria-sequoia/runtime-manifest.json'));
  const pkg = JSON.parse(read('package.json'));

  assert.equal(provenance.sourceRepository, 'sidhulyalkar/sids-neural-net');
  assert.equal(provenance.sourceCommit, 'b6b5c89fffbd2429e628de800df40a52ec600ef8');
  assert.equal(provenance.expectedRuntimeSha256, '73e89f393e94bf15f1b6393a00ef1a611b0d224b901ab7b5e5654a65511ddf0b');
  assert.equal(manifest.version, '0.6.2');
  assert.equal(manifest.modules.length, 38);
  assert.equal(pkg.name, 'sylvaria-sequoia');
  assert.equal(pkg.dependencies, undefined, 'standalone game must not inherit website runtime dependencies');
  assert.equal(pkg.devDependencies?.next, undefined);
  assert.equal(pkg.devDependencies?.react, undefined);
  assert.ok(existsSync('public/index.html'));
  assert.ok(existsSync('scripts/serve.mjs'));
  assert.ok(!existsSync('.github/workflows/bootstrap.yml'), 'one-shot extraction workflow must retire itself');
});

test('standalone cabinet preserves same-origin game focus messaging', () => {
  const shell = read('public/index.html');
  const bridge = read('public/game-runtimes/game-network-bridge.js');
  const server = read('scripts/serve.mjs');

  assert.match(shell, /game-runtimes\/sylvaria-sequoia\/index\.html/);
  assert.match(shell, /sids-game-network-runtime/);
  assert.match(shell, /game-runtime-focused/);
  assert.match(bridge, /window\.parent\.postMessage/);
  assert.match(server, /arcade\/sylvaria-sequoia/);
});
