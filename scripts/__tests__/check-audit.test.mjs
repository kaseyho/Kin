import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(repositoryRoot, 'scripts/check-audit.mjs');

test('passes and reports moderate advisories when no severe runtime issue exists', () => {
  const result = runAuditCheck({
    metadata: {
      vulnerabilities: { critical: 0, high: 0, info: 0, low: 0, moderate: 13, total: 13 },
    },
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /13 moderate, 0 high, 0 critical/);
});

test('fails when a high runtime advisory exists', () => {
  const result = runAuditCheck({
    metadata: {
      vulnerabilities: { critical: 0, high: 1, info: 0, low: 0, moderate: 2, total: 3 },
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /severe production dependency advisory/);
});

test('uses a distinct failure for malformed audit output', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    input: 'not-json',
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /valid npm audit JSON/);
});

function runAuditCheck(report) {
  return spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    input: JSON.stringify(report),
  });
}
