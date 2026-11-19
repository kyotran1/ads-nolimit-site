import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Bài blog: mỗi bài là một file .md.
 * - Tiếng Việt: src/content/blog/      → /blog/<tên-file>/
 * - Tiếng Anh:  src/content/blog-en/   → /en/blog/<tên-file>/
 * Bài có bản dịch: thêm cặp đường dẫn vào `routes` trong src/config/i18n.ts để nút VI | EN trỏ đúng bài.
 */
const schema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  /** Nguồn tham khảo hiển thị cuối bài */
  sources: z.array(z.object({ title: z.string(), url: z.url() })).optional(),
  /** Hiện dòng "Bài viết mang tính tham khảo, không phải tư vấn pháp lý." */
  legalDisclaimer: z.boolean().optional(),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema,
});

const blogEn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog-en' }),
  schema,
});

export const collections = { blog, blogEn };
