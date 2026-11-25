/** /tro-ly-ai/kien-thuc.json — kiến thức cho trợ lý AI (xem src/lib/tro-ly/knowledge.ts). */
import type { APIRoute } from 'astro';
import { buildKnowledge } from '../../lib/tro-ly/knowledge';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildKnowledge()), { headers: { 'content-type': 'application/json; charset=utf-8' } });
