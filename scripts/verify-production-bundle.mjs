import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const expoCli = fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url));
const outputDirectory = await mkdtemp(join(tmpdir(), 'kin-production-bundle-'));
const fixtures = {
  EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
  EXPO_PUBLIC_KIN_PUBLIC_URL: 'https://kin-bundle-fixture.example',
  EXPO_PUBLIC_REVENUECAT_WEB_API_KEY: 'rcb_bundle_fixture',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_bundle_fixture',
  EXPO_PUBLIC_SUPABASE_URL: 'https://kin-bundle-fixture.supabase.co',
};

try {
  const result = spawnSync(
    process.execPath,
    [expoCli, 'export', '--platform', 'web', '--output-dir', outputDirectory, '--clear'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPO_PUBLIC_KIN_ENVIRONMENT: '',
        EXPO_PUBLIC_KIN_PUBLIC_URL: '',
        EXPO_PUBLIC_REVENUECAT_WEB_API_KEY: '',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
        EXPO_PUBLIC_SUPABASE_URL: '',
        ...fixtures,
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Production export exited with ${result.status}.`);
  }

  const bundle = await readBundleText(outputDirectory);
  for (const value of Object.values(fixtures)) {
    assert.ok(bundle.includes(value), `Production bundle is missing ${value}.`);
  }
  process.stdout.write('Production bundle contains every required public runtime value.\n');
} finally {
  await rm(outputDirectory, { force: true, recursive: true });
}

async function readBundleText(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) contents.push(await readBundleText(path));
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.html')) {
      contents.push(await readFile(path, 'utf8'));
    }
  }
  return contents.join('\n');
}
