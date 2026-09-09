import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../.output/', import.meta.url));
const identityFile = join(root, 'local-service', 'build-identity.js');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith('.js') && path !== identityFile ? [path] : [];
  });
}
const hash = createHash('sha256');
for (const file of ['local-service', 'domain', 'shared'].flatMap(name => files(join(root, name))).sort()) {
  hash.update(relative(root, file).replaceAll('\\', '/')).update('\0').update(readFileSync(file)).update('\0');
}
writeFileSync(identityFile, `export const LOCAL_BUILD_ID = "sha256:${hash.digest('hex')}";\n`);
