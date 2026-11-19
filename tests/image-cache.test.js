import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.js';

const policy = 'private, max-age=3600, must-revalidate';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'travel-image-cache-'));
  const image = join(root, 'photo.svg');
  await writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg"><title>synthetic</title></svg>');
  await writeFile(join(root, 'index.html'), '<h1>Synthetic travel</h1>');
  const server = createServer({ publicDir: root });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); await rm(root, { recursive: true, force: true }); });
  return { root, image, base: 'http://127.0.0.1:' + server.address().port };
}

test('static images have private cache metadata and matching GET/HEAD/304 semantics', async t => {
  const { base } = await fixture(t);
  const first = await fetch(base + '/photo.svg');
  const body = await first.text();
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), policy);
  assert.equal(first.headers.get('vary'), 'Authorization');
  assert.ok(first.headers.get('etag'));
  assert.ok(Number.isFinite(Date.parse(first.headers.get('last-modified'))));
  const head = await fetch(base + '/photo.svg', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(Buffer.byteLength(body)));
  assert.equal(head.headers.get('etag'), first.headers.get('etag'));
  assert.equal(await head.text(), '');
  for (const method of ['GET', 'HEAD']) {
    const conditional = await fetch(base + '/photo.svg', { method, headers: { 'If-None-Match': first.headers.get('etag') } });
    assert.equal(conditional.status, 304);
    for (const header of ['etag', 'last-modified', 'cache-control', 'content-type', 'vary']) assert.equal(conditional.headers.get(header), first.headers.get(header), header);
    assert.equal(conditional.headers.get('content-length'), null);
    assert.equal(await conditional.text(), '');
  }
});

test('image conditions support weak/list/star tags and prioritize tags over dates', async t => {
  const { base } = await fixture(t);
  const first = await fetch(base + '/photo.svg');
  const tag = first.headers.get('etag');
  for (const value of ['*', tag.replace(/^W\//, ''), '"unrelated", ' + tag]) {
    assert.equal((await fetch(base + '/photo.svg', { headers: { 'If-None-Match': value } })).status, 304);
  }
  assert.equal((await fetch(base + '/photo.svg', { headers: { 'If-Modified-Since': first.headers.get('last-modified') } })).status, 304);
  assert.equal((await fetch(base + '/photo.svg', { headers: { 'If-Modified-Since': 'invalid date' } })).status, 200);
  assert.equal((await fetch(base + '/photo.svg', { headers: { 'If-None-Match': '"different"', 'If-Modified-Since': 'Wed, 01 Jan 2100 00:00:00 GMT' } })).status, 200);
  assert.equal((await fetch(base + '/photo.svg', { headers: { 'If-None-Match': tag, 'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT' } })).status, 304);
});

test('changed images get new validators and old tags fetch new bytes', async t => {
  const { base, image } = await fixture(t);
  const first = await fetch(base + '/photo.svg');
  await writeFile(image, '<svg><title>changed synthetic image with different bytes</title></svg>');
  const updated = await fetch(base + '/photo.svg', { headers: { 'If-None-Match': first.headers.get('etag') } });
  assert.equal(updated.status, 200);
  assert.notEqual(updated.headers.get('etag'), first.headers.get('etag'));
  assert.match(await updated.text(), /changed synthetic/);
});

test('image formats are recognized while HTML, missing files and method errors do not get image caching', async t => {
  const { base, root } = await fixture(t);
  for (const [extension, type] of Object.entries({ jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', avif:'image/avif', ico:'image/x-icon' })) {
    await writeFile(join(root, 'synthetic.' + extension), 'synthetic image bytes');
    const response = await fetch(base + '/synthetic.' + extension);
    assert.equal(response.headers.get('content-type'), type);
    assert.equal(response.headers.get('cache-control'), policy);
  }
  for (const [path, method, status] of [['/', 'GET', 200], ['/missing.png','GET',404], ['/photo.svg','POST',405]]) {
    const response = await fetch(base + path, { method, headers: { 'If-None-Match': '*' } });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('etag'), null);
  }
});
