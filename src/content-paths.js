import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function directory(value, name) {
  if (typeof value !== 'string' || !isAbsolute(value) || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`${name} must be an absolute path.`);
  const path = resolve(value), info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`${name} must be a canonical directory.`);
  return path;
}
function requiredFile(root, name) {
  const file = join(root, name), info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || realpathSync(file) !== file) throw new Error('Travel content requires canonical regular files.');
}
export function resolveContentPaths(env = process.env, { root = sourceRoot } = {}) {
  const contentRoot = env.TRAVEL_CONTENT_ROOT ? directory(env.TRAVEL_CONTENT_ROOT, 'TRAVEL_CONTENT_ROOT') : null;
  const seedValue = env.TRAVEL_SEED_DIR || (contentRoot && join(contentRoot, 'catalog'));
  const publicValue = env.TRAVEL_PUBLIC_DIR || (contentRoot && join(contentRoot, 'published'));
  const seedDir = seedValue ? directory(seedValue, 'TRAVEL_SEED_DIR') : join(root, 'data');
  const publicDir = publicValue ? directory(publicValue, 'TRAVEL_PUBLIC_DIR') : join(root, 'public');
  if (seedValue) for (const file of ['trips.json', 'routes.json', 'photo-credits.json']) requiredFile(seedDir, file);
  if (publicValue) requiredFile(publicDir, 'index.html');
  return { contentRoot, seedDir, publicDir };
}
