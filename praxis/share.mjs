import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';

const workspace = resolve(fileURLToPath(new URL('../', import.meta.url)));
const maximum = 1024 * 1024;
const tripPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const privateSegments = new Set(['api', 'src', 'node_modules', '@fs', '@id', '@vite', 'map', '_amapservice']);
const denied = () => Object.assign(new Error('Share is not available.'), { status: 404, code: 'NOT_FOUND' });

export function validateShareManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || !Array.isArray(value.shares) || value.shares.length > 10000) return false;
  return value.shares.every(item => item && typeof item === 'object' && !Array.isArray(item)
    && typeof item.id === 'string' && item.id.length <= 200
    && typeof item.trip === 'string' && item.trip.length <= 200 && tripPattern.test(item.trip)
    && typeof item.token_hash === 'string' && /^[a-f0-9]{64}$/.test(item.token_hash)
    && Number.isSafeInteger(item.created_at) && item.created_at >= 0
    && Number.isSafeInteger(item.expires_at) && item.expires_at > item.created_at
    && (item.revoked_at === null || Number.isSafeInteger(item.revoked_at) && item.revoked_at >= 0));
}

export async function readTravelShares(file) {
  if (typeof file !== 'string' || !isAbsolute(file) || resolve(file) !== file || file === workspace || file.startsWith(workspace + sep) || /[\0\r\n]/.test(file)) throw denied();
  let handle;
  try {
    const directory = dirname(file);
    if (await realpath(directory) !== directory) throw denied();
    const parent = await stat(directory);
    if (!parent.isDirectory() || parent.mode & 0o077 || parent.uid !== process.getuid()) throw denied();
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600 || info.uid !== process.getuid() || info.size > maximum) throw denied();
    const bytes = Buffer.alloc(maximum + 1);
    let size = 0;
    while (size < bytes.length) {
      const read = await handle.read(bytes, size, bytes.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > maximum) throw denied();
    const value = JSON.parse(bytes.subarray(0, size).toString('utf8'));
    if (!validateShareManifest(value)) throw denied();
    return value;
  } catch { throw denied(); }
  finally { await handle?.close().catch(() => {}); }
}

export async function authorizeTravelShare(request, { file, clock = Date.now, origin } = {}) {
  const path = request.url;
  if (!['GET', 'HEAD'].includes(request.method) || request.headers?.upgrade || typeof path !== 'string' || path.length > 4096 || /[%\\?#\x00-\x20\x7f]/.test(path) || path.includes('//')) throw denied();
  if (origin && request.headers?.origin && request.headers.origin !== origin) throw denied();
  const parts = path.split('/');
  if (parts.length < 5 || parts[0] !== '' || parts[1] !== 'share' || parts[2] !== 'travel' || !/^[A-Za-z0-9_-]{43}$/.test(parts[3]) || !tripPattern.test(parts[4])) throw denied();
  if (parts.slice(5).some(part => part.startsWith('.') || privateSegments.has(part.toLowerCase()) || !/^[A-Za-z0-9_.~!$&'()+,;=@-]*$/.test(part))) throw denied();
  const digest = createHash('sha256').update(parts[3]).digest();
  const { shares } = await readTravelShares(file);
  const now = clock() / 1000;
  if (!shares.some(item => timingSafeEqual(Buffer.from(item.token_hash, 'hex'), digest) && item.trip === parts[4] && item.revoked_at === null && item.created_at <= now && now < item.expires_at)) throw denied();
  return { pathname: '/' + parts.slice(4).join('/'), prefix: '/share/travel/' + parts[3] };
}
