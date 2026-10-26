import test from 'node:test';
import assert from 'node:assert/strict';
import { editorDocument, crawlerFiles, SITE_URL } from '../../scripts/site-document.mjs';

test('production is indexable while preview builds retain noindex and the production canonical', () => {
  assert.match(editorDocument(), /name="robots" content="index, follow"/);
  assert.match(editorDocument({ preview: true }), /name="robots" content="noindex, nofollow"/);
  for (const preview of [false, true]) assert.ok(editorDocument({ preview }).includes(`<link rel="canonical" href="${SITE_URL}">`));
});

test('the sitemap advertises only the public editor, never local project or recipient routes', () => {
  const files = crawlerFiles();
  assert.match(files['robots.txt'], /User-agent: \*\nAllow: \/\nSitemap: https:\/\/letras-ascii.vercel.app\/sitemap.xml/);
  assert.deepEqual([...files['sitemap.xml'].matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]), [SITE_URL]);
  assert.match(files['404.html'], /name="robots" content="noindex"/);
  assert.match(files['404.html'], /href="\/">Volver al editor/);
});
