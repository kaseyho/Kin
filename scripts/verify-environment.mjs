import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const demo = readExpoConfig({
  EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo',
});
assertReleaseShape(demo);
assert.equal(demo.extra?.kinEnvironment, 'demo');

const production = readExpoConfig({
  EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  EXPO_PUBLIC_SUPABASE_URL: 'https://kin-fixture.supabase.co',
});
assertReleaseShape(production);
assert.equal(production.extra?.kinEnvironment, 'production');

process.stdout.write('Expo environment configuration is valid for demo and production.\n');

function readExpoConfig(overrides) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['expo', 'config', '--type', 'public', '--json'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPO_PUBLIC_KIN_ENVIRONMENT: '',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
        EXPO_PUBLIC_SUPABASE_URL: '',
        ...overrides,
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(`Expo config failed for ${overrides.EXPO_PUBLIC_KIN_ENVIRONMENT}.`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Expo config returned invalid JSON for ${overrides.EXPO_PUBLIC_KIN_ENVIRONMENT}.`);
  }
}

function assertReleaseShape(config) {
  assert.equal(config.name, 'Kin');
  assert.equal(config.slug, 'kin');
  assert.equal(config.scheme, 'kin');
  assert.equal(config.userInterfaceStyle, 'light');
  assert.equal(config.ios?.bundleIdentifier, 'com.kaseyho.kin');
  assert.equal(config.android?.package, 'com.kaseyho.kin');
  assert.equal(config.web?.output, 'single');
  assert.ok(!config.android?.permissions?.includes('android.permission.RECORD_AUDIO'));
}
