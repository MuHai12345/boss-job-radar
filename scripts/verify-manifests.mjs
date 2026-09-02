import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const packageJson = JSON.parse(
  await readFile(path.join(repoRoot, 'package.json'), 'utf8'),
);
const buildTargets = [
  { name: 'Chrome', directory: 'chrome-mv3' },
  { name: 'Edge', directory: 'edge-mv3' },
];
const expectedPermissions = ['activeTab', 'scripting'];
const forbiddenPermissions = ['tabs', 'storage', 'cookies'];

const forbiddenManifestKeys = [
  'background',
  'content_scripts',
  'host_permissions',
  'optional_host_permissions',
  'optional_permissions',
];

for (const target of buildTargets) {
  const manifestPath = path.join(
    repoRoot,
    '.output',
    target.directory,
    'manifest.json',
  );
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.manifest_version, 3, `${target.name}: requires MV3`);
  assert.equal(
    manifest.version,
    packageJson.version,
    `${target.name}: version must match package.json`,
  );
  assert.equal(
    typeof manifest.action?.default_popup,
    'string',
    `${target.name}: popup is missing`,
  );
  assert.deepEqual(
    [...manifest.permissions].sort(),
    [...expectedPermissions].sort(),
    `${target.name}: permissions must be exactly activeTab and scripting`,
  );

  for (const permission of forbiddenPermissions) {
    assert.equal(
      manifest.permissions.includes(permission),
      false,
      `${target.name}: forbidden permission ${permission}`,
    );
  }

  for (const key of forbiddenManifestKeys) {
    assert.equal(
      Object.hasOwn(manifest, key),
      false,
      `${target.name}: forbidden manifest key ${key}`,
    );
  }

  assert.equal(
    manifestText.includes('<all_urls>'),
    false,
    `${target.name}: <all_urls> is forbidden`,
  );

  console.log(
    `${target.name}: PASS (MV3, popup, version ${manifest.version}, activeTab + scripting only)`,
  );
}
