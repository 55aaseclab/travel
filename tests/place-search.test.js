import test from 'node:test';
import assert from 'node:assert/strict';
import { placeSearchUrls, renderPlaceSearch } from '../src/place-search.js';

test('place searches use only the encoded place keyword on the requested official hosts', () => {
  const keyword='成都 & keyword=别的词 #图片?word=错误';
  const urls=placeSearchUrls({name:'显示名称',query:keyword});
  const xhs=new URL(urls.xiaohongshu);const baidu=new URL(urls.baidu);
  assert.equal(xhs.origin,'https://www.xiaohongshu.com');assert.equal(xhs.pathname,'/search_result');
  assert.equal(xhs.searchParams.get('keyword'),keyword);assert.equal(xhs.searchParams.size,1);
  assert.equal(baidu.origin,'https://image.baidu.com');assert.equal(baidu.pathname,'/search/index');
  assert.equal(baidu.searchParams.get('word'),keyword);assert.equal(baidu.searchParams.get('tn'),'baiduimage');
  assert.equal(baidu.searchParams.size,2);assert.equal(xhs.hash,'');assert.equal(baidu.hash,'');
});

test('search links preserve names as text and open isolated new tabs', () => {
  const place={name:'<img src=x onerror=alert(1)>',query:'北京午饭'};
  const html=renderPlaceSearch(place);
  assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g)||[]).length,2);
  assert.ok(html.includes('小红书'));assert.ok(html.includes('百度图片'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert.doesNotMatch(html,/<img/);
  assert.equal(new URL(placeSearchUrls({name:'汉字',query:'  '}).xiaohongshu).searchParams.get('keyword'),'汉字');
  assert.throws(()=>placeSearchUrls({name:''}),Error);
});
