import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const expoCli = fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url));
const outputDirectory = await mkdtemp(join(tmpdir(), 'kin-production-bundle-'));
const requiredPublicFixtures = {
  EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
  EXPO_PUBLIC_KIN_PUBLIC_URL: 'https://kin-bundle-fixture.example',
  EXPO_PUBLIC_KIN_SUPPORT_EMAIL: 'support@kin-fixture.com',
  EXPO_PUBLIC_REVENUECAT_WEB_API_KEY: 'rcb_bundle_fixture',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_bundle_fixture',
  EXPO_PUBLIC_SUPABASE_URL: 'https://kin-bundle-fixture.supabase.co',
};
const excludedPublicFixtures = {
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: 'goog_native_bundle_fixture_must_not_ship',
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'appl_native_bundle_fixture_must_not_ship',
};
const serverSecretFixtures = {
  EXPO_PUBLIC_REVENUECAT_SECRET_API_KEY: 'sk_publicly_named_fixture_must_not_ship',
  EXPO_PUBLIC_REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer webhook_fixture_must_not_ship',
  EXPO_PUBLIC_REVENUECAT_WEBHOOK_SIGNING_SECRET: 'whsec_public_fixture_must_not_ship',
  REVENUECAT_SECRET_API_KEY: 'sk_server_fixture_must_not_ship',
  REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer server_webhook_fixture_must_not_ship',
  REVENUECAT_WEBHOOK_SIGNING_SECRET: 'whsec_server_fixture_must_not_ship',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_server_fixture_must_not_ship',
};
const fixtures = {
  ...requiredPublicFixtures,
  ...excludedPublicFixtures,
  ...serverSecretFixtures,
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
        EXPO_PUBLIC_KIN_SUPPORT_EMAIL: '',
        EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: '',
        EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: '',
        EXPO_PUBLIC_REVENUECAT_SECRET_API_KEY: '',
        EXPO_PUBLIC_REVENUECAT_WEB_API_KEY: '',
        EXPO_PUBLIC_REVENUECAT_WEBHOOK_AUTHORIZATION: '',
        EXPO_PUBLIC_REVENUECAT_WEBHOOK_SIGNING_SECRET: '',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
        EXPO_PUBLIC_SUPABASE_URL: '',
        REVENUECAT_SECRET_API_KEY: '',
        REVENUECAT_WEBHOOK_AUTHORIZATION: '',
        REVENUECAT_WEBHOOK_SIGNING_SECRET: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        ...fixtures,
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Production export exited with ${result.status}.`);
  }

  const bundle = await readBundleText(outputDirectory);
  for (const value of Object.values(requiredPublicFixtures)) {
    assert.ok(bundle.includes(value), `Production bundle is missing ${value}.`);
  }
  for (const value of [
    ...Object.values(excludedPublicFixtures),
    ...Object.values(serverSecretFixtures),
  ]) {
    assert.ok(!bundle.includes(value), `Production bundle contains forbidden value ${value}.`);
  }
  for (const name of [
    'REVENUECAT_SECRET_API_KEY',
    'REVENUECAT_WEBHOOK_AUTHORIZATION',
    'REVENUECAT_WEBHOOK_SIGNING_SECRET',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    assert.ok(!bundle.includes(name), `Production bundle contains server-only variable ${name}.`);
  }
  for (const pattern of [
    /sb_secret_[A-Za-z0-9_-]{8,}/,
    /sk_[A-Za-z0-9_-]{12,}/,
    /whsec_[A-Za-z0-9_-]{8,}/,
  ]) {
    assert.doesNotMatch(bundle, pattern, `Production bundle matches secret pattern ${pattern}.`);
  }
  process.stdout.write('Production web bundle contains only required public runtime values.\n');
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
