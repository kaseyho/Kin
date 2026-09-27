import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const paths = {
  adaptive: './assets/brand/adaptive-icon.png',
  favicon: './assets/brand/favicon.png',
  icon: './assets/brand/app-icon.png',
  mark: './assets/brand/kin-mark.svg',
  monochrome: './assets/brand/monochrome-icon.png',
  splash: './assets/brand/splash-icon.png',
};

const environment = {
  ...process.env,
  EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo',
};
delete environment.FORCE_COLOR;
environment.NO_COLOR = '1';

const expo = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['expo', 'config', '--type', 'public', '--json'],
  { cwd: root, encoding: 'utf8', env: environment },
);
assert.equal(expo.status, 0, expo.stderr || 'Expo config did not resolve.');
const config = JSON.parse(expo.stdout);

assert.equal(config.icon, paths.icon, 'The shared store icon must be configured.');
assert.equal(
  config.android?.adaptiveIcon?.foregroundImage,
  paths.adaptive,
  'Android must use the adaptive foreground artwork.',
);
assert.equal(
  config.android?.adaptiveIcon?.monochromeImage,
  paths.monochrome,
  'Android must expose a themed monochrome icon.',
);
assert.equal(
  config.android?.adaptiveIcon?.backgroundColor,
  '#F8F3ED',
  'Android adaptive icons must use Kin parchment.',
);
assert.equal(config.web?.favicon, paths.favicon, 'Web must use the Kin favicon.');

const splashPlugin = config.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
);
assert.ok(splashPlugin, 'The native splash screen plugin must be configured.');
assert.deepEqual(
  splashPlugin[1],
  {
    backgroundColor: '#F8F3ED',
    image: paths.splash,
    imageWidth: 188,
    resizeMode: 'contain',
  },
  'The native splash screen must use the approved Kin mark and restraint.',
);

const expectedPngs = [
  [paths.icon, 1024, 1024, false],
  [paths.adaptive, 1024, 1024, true],
  [paths.monochrome, 1024, 1024, true],
  [paths.splash, 1024, 1024, true],
  [paths.favicon, 48, 48, true],
];

for (const [path, width, height, allowsAlpha] of expectedPngs) {
  const png = readPng(resolve(root, path));
  assert.equal(png.width, width, `${path} must be ${width}px wide.`);
  assert.equal(png.height, height, `${path} must be ${height}px high.`);
  if (!allowsAlpha) {
    assert.equal(png.colorType, 2, `${path} must be an opaque RGB PNG without alpha.`);
  }
}

const mark = readFileSync(resolve(root, paths.mark), 'utf8');
assert.doesNotMatch(mark, /<text\b/i, 'The mark must not depend on a font or wordmark.');
assert.match(mark, /#2F232B/i, 'The mark must use Kin plum.');
assert.match(mark, /#A64B68/i, 'The mark must use Kin rose.');

console.log('Kin brand assets and resolved Expo configuration are valid.');

function readPng(path) {
  const bytes = readFileSync(path);
  assert.equal(
    bytes.subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a',
    `${path} must be a PNG file.`,
  );
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR', `${path} has no PNG IHDR.`);
  return {
    colorType: bytes.readUInt8(25),
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
}
