#!/usr/bin/env node
import http from 'node:http';
import { resolveContentPaths } from './content-paths.js';
import { itineraryScript } from './render-itinerary.js';
import { imageCacheHeaders, imageNotModified } from './image-cache.js';
import { createMapHandler } from './itinerary-map-service.js';
import { createWebServiceHandler } from './amap-web-service.js';
import { loadBusinessService } from './business.js';
import { createSharedGuideRenderer, readBusinessBody } from './shared-guide.js';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.avif', 'image/avif'],
  ['.ico', 'image/x-icon'],
]);

function within(root, target) {
  const path = relative(root, target);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function send(req, res, status, body, headers = {}) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'Content-Length': bytes.length, ...headers });
  res.end(req.method === 'HEAD' ? undefined : bytes);
}

export function createServer({ publicDir, businessService, ...mapOptions } = {}) {
  const content = resolveContentPaths();
  const root = resolve(publicDir ?? content.publicDir);
  mapOptions.dataDir ??= content.seedDir;
  const business = businessService === undefined ? loadBusinessService(process.env, { seedDir: mapOptions.dataDir, mapOptions }) : businessService;
  const sharedGuide = business && createSharedGuideRenderer(business);
  if (business) mapOptions.mapReadItinerary = async tripId => business.hasTrip(tripId) ? (await business.readSharedTrip(tripId)).itinerary : null;
  const handleMap = createMapHandler(mapOptions);
  const handleWebService = createWebServiceHandler(mapOptions);
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.url === '/health' && ['GET','HEAD'].includes(req.method)) {
      return send(req, res, 200, '{"status":"ok","appId":"travel"}', {'Content-Type':'application/json; charset=utf-8'});
    }
    const textHeaders = { 'Content-Type': 'text/plain; charset=utf-8' };
    if ((req.url || '').split('?', 1)[0] === '/api/business' && business) {
      const json = (status, value, headers = {}) => send(req, res, status, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8', ...headers });
      if (req.method !== 'POST') return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for business requests' } }, { Allow: 'POST' });
      if (req.url.includes('?') || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return json(400, { error: { code: 'INVALID_REQUEST', message: 'A JSON business request is required' } });
      if (typeof req.headers['x-praxis-assertion'] !== 'string' || req.headers['x-praxis-assertion'].length > 32768) return json(401, { error: { code: 'INVALID_ASSERTION', message: 'A valid business assertion is required' } });
      try { return json(200, await business.handle(await readBusinessBody(req), req.headers['x-praxis-assertion'])); }
      catch (error) { return json(error.status || 500, { error: { code: error.code || 'INTERNAL_ERROR', message: error.status ? error.message : 'Business request failed' } }); }
    }
    if (!['GET', 'HEAD'].includes(req.method)) return send(req, res, 405, 'Method not allowed.\n', { ...textHeaders, Allow: 'GET, HEAD' });
    try {
      const rawPath = (req.url || '/').split('?', 1)[0];
      let pathname;
      try { pathname = decodeURIComponent(rawPath); }
      catch { return send(req, res, 400, 'Bad request.\n', textHeaders); }
      if (!pathname.startsWith('/') || /[\x00-\x1f\x7f]/.test(pathname)) return send(req, res, 400, 'Bad request.\n', textHeaders);
      if (pathname.includes('\\') || pathname.split('/').some(part => part === '.' || part === '..')) return send(req, res, 403, 'Forbidden.\n', textHeaders);
      if (pathname.split('/').some(part => part.startsWith('.'))) return send(req, res, 404, 'Not found.\n', textHeaders);
      if (await handleWebService(req, res, pathname) || await handleMap(req, res, pathname)) return;
      const page = sharedGuide && await sharedGuide(pathname);
      if (page) return send(req, res, 200, page.body, { 'Content-Type': page.type });
      const candidate = resolve(root, `.${pathname}`, ...(pathname.endsWith('/') ? ['index.html'] : []));
      if (!within(root, candidate)) return send(req, res, 403, 'Forbidden.\n', textHeaders);
      const [realRoot, realFile] = await Promise.all([realpath(root), realpath(candidate)]);
      if (!within(realRoot, realFile)) return send(req, res, 403, 'Forbidden.\n', textHeaders);
      const info = await stat(realFile);
      if (info.isDirectory() && !pathname.endsWith('/')) {
        const index = await realpath(join(realFile, 'index.html'));
        if (!within(realRoot, index)) return send(req, res, 403, 'Forbidden.\n', textHeaders);
        if ((await stat(index)).isFile()) return send(req, res, 308, '', { Location: `${pathname}/` });
      }
      if (!info.isFile()) return send(req, res, 404, 'Not found.\n', textHeaders);
      const type = contentTypes.get(extname(realFile).toLowerCase()) || 'application/octet-stream';
      const headers = { 'Content-Type': type, ...(type.startsWith('image/') ? imageCacheHeaders(info) : {}) };
      if (type.startsWith('image/') && imageNotModified(req, headers)) {
        res.writeHead(304, headers);
        return res.end();
      }
      const bytes = await readFile(realFile);
      if ((process.env.TRAVEL_CONTENT_ROOT || process.env.TRAVEL_PUBLIC_DIR) && content.publicDir === root && type.startsWith('text/html')) {
        // Published copies can outlive the application version. Only the renderer-owned
        // controller is substituted; itinerary content and publication files stay intact.
        const html = bytes.toString('utf8');
        const marker = '<script data-travel-itinerary>';
        const start = html.lastIndexOf(marker), end = html.indexOf('</script>', start);
        if (start >= 0 && end >= 0) return send(req, res, 200, html.slice(0, start) + itineraryScript + html.slice(end + 9), headers);
      }
      return send(req, res, 200, bytes, headers);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) return send(req, res, 404, 'Not found.\n', textHeaders);
      if (['EACCES', 'EPERM'].includes(error.code)) return send(req, res, 403, 'Forbidden.\n', textHeaders);
      console.error('Travel: unable to read public content.');
      return send(req, res, 500, 'Unable to read content.\n', textHeaders);
    }
  });
}

const usage = 'Usage: npm start -- [--host 127.0.0.1] [--port 4323]\nEnvironment: HOST, PORT, TRAVEL_AMAP_CONFIG, TRAVEL_AMAP_ORIGIN, TRAVEL_CONTENT_ROOT, TRAVEL_SEED_DIR, TRAVEL_PUBLIC_DIR\n';
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = { host: process.env.HOST || '127.0.0.1', port: process.env.PORT || '4323' };
    let help = false;
    for (let index = 2; index < process.argv.length; index++) {
      const argument = process.argv[index];
      if (argument === '--help' || argument === '-h') { help = true; continue; }
      if (!['--host', '--port'].includes(argument) || !process.argv[index + 1] || process.argv[index + 1].startsWith('--')) throw new Error('Invalid arguments.');
      options[argument.slice(2)] = process.argv[++index];
    }
    if (help) process.stdout.write(usage);
    else {
      if (!/^\d+$/.test(options.port) || Number(options.port) < 1 || Number(options.port) > 65535) throw new Error('Port must be an integer between 1 and 65535.');
      if (!options.host.trim()) throw new Error('Host must not be empty.');
      const content = resolveContentPaths();
      await access(join(content.publicDir, 'index.html'));
      const server = createServer();
      server.on('error', error => { console.error(`Travel startup failed: ${error.code || 'SERVER_ERROR'}`); process.exitCode = 1; });
      server.listen(Number(options.port), options.host, () => {
        const address = options.host.includes(':') ? `[${options.host}]` : options.host;
        console.log(`Travel listening at http://${address}:${options.port}/`);
      });
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
        server.close();
        server.closeAllConnections();
      });
    }
  } catch (error) {
    console.error(`Travel startup failed: ${error.code || error.message}`);
    process.stderr.write(usage);
    process.exitCode = 1;
  }
}
