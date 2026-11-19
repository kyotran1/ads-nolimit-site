import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Bài blog: mỗi bài là một file .md trong src/content/blog/.
 * Tên file (không đuôi) = đường dẫn bài, ví dụ ai-agent-la-gi.md -> /blog/ai-agent-la-gi/
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    /** Nguồn tham khảo hiển thị cuối bài */
    sources: z.array(z.object({ title: z.string(), url: z.url() })).optional(),
    /** Hiện dòng "Bài viết mang tính tham khảo, không phải tư vấn pháp lý." */
    legalDisclaimer: z.boolean().optional(),
  }),
});

export const collections = { blog };
