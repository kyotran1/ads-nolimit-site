import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { site } from '../config/site';

/**
 * /sitemap.xml — tự liệt kê mọi trang .astro trong src/pages (trừ 404 và trang động)
 * và các bài blog.
 */
const pageModules = import.meta.glob('./**/*.astro');

const staticPaths = Object.keys(pageModules)
  .filter((file) => !file.includes('[') && !file.endsWith('/404.astro'))
  .map((file) => {
    const route = file.replace(/^\.\//, '').replace(/\.astro$/, '').replace(/(^|\/)index$/, '');
    return route ? `/${route}/` : '/';
  });

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');
  const urls = [...staticPaths, ...posts.map((p) => `/blog/${p.id}/`)].sort((a, b) =>
    a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b),
  );

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url><loc>${new URL(path, site.url).href}</loc></url>`).join('\n')}
</urlset>
`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
