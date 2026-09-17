import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const expoCli = fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url));

const demo = readExpoConfig({
  EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo',
});
assertReleaseShape(demo);
assert.equal(demo.extra?.kinEnvironment, 'demo');
assert.equal(demo.extra?.kinPublicUrl, 'https://demo.kin.invalid');
assert.equal(demo.ios?.associatedDomains, undefined);
assert.equal(demo.android?.intentFilters, undefined);

const production = readExpoConfig({
  EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
  EXPO_PUBLIC_KIN_PUBLIC_URL: 'https://kin-fixture.example/app/',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  EXPO_PUBLIC_SUPABASE_URL: 'https://kin-fixture.supabase.co',
});
assertReleaseShape(production);
assert.equal(production.extra?.kinEnvironment, 'production');
assert.equal(production.extra?.kinPublicUrl, 'https://kin-fixture.example/app');
assert.deepEqual(production.ios?.associatedDomains, ['applinks:kin-fixture.example']);
assert.deepEqual(production.android?.intentFilters?.[0]?.data, [{
  host: 'kin-fixture.example',
  pathPrefix: '/app/invite',
  scheme: 'https',
}]);

assertExpoConfigFails({
  EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
  EXPO_PUBLIC_KIN_PUBLIC_URL: 'https://localhost:8081',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  EXPO_PUBLIC_SUPABASE_URL: 'https://kin-fixture.supabase.co',
});

process.stdout.write('Expo environment configuration is valid for demo and production.\n');

function readExpoConfig(overrides) {
  const result = runExpoConfig(overrides);
  if (result.status !== 0) {
    const reason = result.stderr.trim() || `exit status ${result.status}`;
    throw new Error(
      `Expo config failed for ${overrides.EXPO_PUBLIC_KIN_ENVIRONMENT}: ${reason}`,
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Expo config returned invalid JSON for ${overrides.EXPO_PUBLIC_KIN_ENVIRONMENT}.`);
  }
}

function assertExpoConfigFails(overrides) {
  const result = runExpoConfig(overrides);
  assert.notEqual(result.status, 0, 'Expo config accepted a production loopback public URL.');
  assert.match(result.stderr, /public HTTPS app URL/);
}

function runExpoConfig(overrides) {
  return spawnSync(
    process.execPath,
    [expoCli, 'config', '--type', 'public', '--json'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPO_PUBLIC_KIN_ENVIRONMENT: '',
        EXPO_PUBLIC_KIN_PUBLIC_URL: '',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
        EXPO_PUBLIC_SUPABASE_URL: '',
        ...overrides,
      },
    },
  );
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
