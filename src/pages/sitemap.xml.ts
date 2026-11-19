import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { site } from '../config/site';
import { pairFor, unlistedPaths } from '../config/i18n';

/**
 * /sitemap.xml — tự liệt kê mọi trang .astro trong src/pages (cả /en/, trừ 404, trang động
 * và các trang trong `unlistedPaths` của src/config/i18n.ts như trang tài khoản) và mọi bài blog hai ngôn ngữ. Trang có bản ngôn ngữ còn lại (theo src/config/i18n.ts)
 * được kèm liên kết hreflang vi / en / x-default.
 */
const pageModules = import.meta.glob('./**/*.astro');

const staticPaths = Object.keys(pageModules)
  .filter((file) => !file.includes('[') && !file.endsWith('/404.astro'))
  .map((file) => {
    const route = file.replace(/^\.\//, '').replace(/\.astro$/, '').replace(/(^|\/)index$/, '');
    return route ? `/${route}/` : '/';
  })
  .filter((path) => !unlistedPaths.includes(path));

const abs = (path: string) => new URL(path, site.url).href;

export const GET: APIRoute = async () => {
  const postsVi = await getCollection('blog');
  const postsEn = await getCollection('blogEn');
  const urls = [
    ...staticPaths,
    ...postsVi.map((p) => `/blog/${p.id}/`),
    ...postsEn.map((p) => `/en/blog/${p.id}/`),
  ].sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));

  const entry = (path: string) => {
    const pair = pairFor(path);
    const alternates = pair
      ? [
          `    <xhtml:link rel="alternate" hreflang="vi" href="${abs(pair.vi)}"/>`,
          `    <xhtml:link rel="alternate" hreflang="en" href="${abs(pair.en)}"/>`,
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(pair.vi)}"/>`,
        ].join('\n')
      : '';
    return `  <url>\n    <loc>${abs(path)}</loc>${alternates ? `\n${alternates}` : ''}\n  </url>`;
  };

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(entry).join('\n')}
</urlset>
`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
