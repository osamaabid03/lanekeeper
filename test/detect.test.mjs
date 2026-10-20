// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { definitionsIn, parseDiff, lockfileNote, detect } from '../lib/detect.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('definitionsIn finds definitions across languages', () => {
  assert.deepEqual(definitionsIn('export class PaymentService {'), ['PaymentService']);
  assert.deepEqual(definitionsIn('const f = async (a) => 1;'), ['f']);
  assert.deepEqual(definitionsIn('def foo(x):'), ['foo']);
  assert.deepEqual(definitionsIn('func (s *S) Bar() {'), ['Bar']);
  assert.deepEqual(definitionsIn('pub async fn baz() {'), ['baz']);
  assert.deepEqual(definitionsIn('  charge(amount: number) {'), ['charge']);
  assert.deepEqual(definitionsIn('type Foo = {'), ['Foo']);
});

test('definitionsIn ignores control flow and plain code', () => {
  assert.deepEqual(definitionsIn('if (x) {'), []);
  assert.deepEqual(definitionsIn('return foo(bar);'), []);
});

test('parseDiff reports status, symbols and changed lines', () => {
  const files = parseDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,2 +1,2 @@ function ctx() {
-export class Old {
+export class New {
diff --git a/b.ts b/b.ts
--- /dev/null
+++ b/b.ts
@@ -0,0 +1 @@
+x
diff --git a/c.ts b/c.ts
--- a/c.ts
+++ /dev/null
@@ -1 +0,0 @@
-gone`);
  assert.deepEqual(files.map((f) => [f.path, f.status]), [['a.ts', 'modified'], ['b.ts', 'added'], ['c.ts', 'deleted']]);
  assert.deepEqual([...files[0].symbols].sort(), ['New', 'Old', 'ctx']);
  assert.deepEqual(files[0].added, ['export class New {']);
  assert.deepEqual(files[0].removed, ['export class Old {']);
  assert.deepEqual(files[2].removed, ['gone']);
});

test('lockfileNote names added packages, falls back to the file', () => {
  const line = (n) => `    "node_modules/${n}": { "version": "1.0.0" },`;
  assert.equal(lockfileNote({ path: 'package-lock.json', added: [line('stripe')], removed: [] }), 'Added stripe');
  assert.equal(lockfileNote({ path: 'package-lock.json', added: [line('@paypal/sdk')], removed: [] }), 'Added @paypal/sdk');
  assert.equal(lockfileNote({ path: 'package-lock.json', added: [line('a')], removed: [line('a')] }), 'Changed package-lock.json');
  assert.equal(
    lockfileNote({ path: 'package-lock.json', added: ['a', 'b', 'c', 'd', 'e'].map(line), removed: [] }),
    'Added a, b, c and 2 more',
  );
});

test('detect() on the demo repo: quiet at the start, clashes appear as agents work', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanekeeper-test-'));
  try {
    execFileSync('bash', [path.join(here, '..', 'examples', 'make-demo-repo.sh'), path.join(dir, 'demo')], { stdio: 'ignore' });
    const shop = path.join(dir, 'demo', 'shop');

    // Only the stripe agent has changed anything, so there is nothing to clash with yet.
    let s = detect(shop);
    assert.equal(s.base, 'main');
    assert.deepEqual(s.agents.map((a) => [a.letter, a.branch]), [['A', 'agent/stripe']]);
    assert.equal(s.clashes.length, 0);

    // The paypal agent calls the method stripe renamed, from a new file, and adds a package.
    const paypal = path.join(dir, 'demo', 'shop-paypal');
    fs.mkdirSync(path.join(paypal, 'src/payments/paypal'), { recursive: true });
    fs.writeFileSync(
      path.join(paypal, 'src/payments/paypal/client.ts'),
      "import { PaymentService } from '../PaymentService';\n\nexport function enablePayPal(service: PaymentService) {\n  return service.charge(1);\n}\n",
    );
    const lock = path.join(paypal, 'package-lock.json');
    fs.writeFileSync(lock, fs.readFileSync(lock, 'utf8').replace('"": { "name": "shop" },', '"": { "name": "shop" },\n    "node_modules/@paypal/sdk": { "version": "1.4.0" },'));
    fs.appendFileSync(path.join(dir, 'demo', 'shop-product-page', 'src/product/ProductPage.tsx'), '// description\n');

    s = detect(shop);
    // Stripe keeps its letter when the others appear.
    assert.deepEqual(s.agents.map((a) => [a.letter, a.branch]), [['A', 'agent/stripe'], ['B', 'agent/paypal'], ['C', 'agent/product-page']]);

    const high = s.clashes.filter((c) => c.severity === 'high');
    assert.equal(high.length, 1);
    assert.equal(high[0].kind, 'removed-used');
    assert.equal(high[0].symbol, 'charge');
    assert.match(high[0].explain, /\(agent\/stripe\).*\(agent\/paypal\)/);
    // Paypal's work isn't committed yet, so Git can't vouch for it either way.
    assert.equal(high[0].git, 'uncommitted');

    const lockClashes = s.clashes.filter((c) => c.kind === 'lockfile');
    assert.equal(lockClashes.length, 1);
    assert.equal(lockClashes[0].severity, 'medium');

    assert.equal(s.clashes.length, 2);
    // Clash-free product page goes first; the agent that renamed charge goes last.
    assert.equal(s.mergeOrder[0].branch, 'agent/product-page');
    assert.equal(s.mergeOrder.at(-1).branch, 'agent/stripe');

    // The point of the demo: Git itself sees nothing wrong with merging these two branches.
    execFileSync('git', ['-C', paypal, 'add', '-A']);
    execFileSync('git', ['-C', paypal, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'paypal']);
    execFileSync('git', ['-C', shop, 'merge-tree', '--write-tree', 'agent/stripe', 'agent/paypal'], { stdio: 'ignore' });

    // Once committed, Lanekeeper says the same: Git won't warn about the High clash.
    const committed = detect(shop).clashes.find((c) => c.severity === 'high');
    assert.equal(committed.git, 'clean');
    assert.match(committed.explain, /nothing will warn you/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detect() reports when Git itself will flag the conflict', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanekeeper-test-'));
  const sh = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { stdio: 'ignore' });
  try {
    const main = path.join(dir, 'repo');
    fs.mkdirSync(main);
    sh(main, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(main, 'app.js'), 'function pay() {\n  return 1;\n}\n');
    sh(main, 'add', '-A');
    sh(main, 'commit', '-qm', 'base');
    for (const [name, body] of [['one', 'return 2;'], ['two', 'return 3;']]) {
      const wt = path.join(dir, name);
      sh(main, 'worktree', 'add', '-q', '-b', `agent/${name}`, wt);
      fs.writeFileSync(path.join(wt, 'app.js'), `function pay() {\n  ${body}\n}\n`);
      sh(wt, 'commit', '-qam', name);
    }
    const c = detect(main).clashes.find((x) => x.kind === 'same-function');
    assert.equal(c.git, 'conflict');
    assert.match(c.explain, /text conflict/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
