// จบวัน 23:50 — ลบการ์ดประจำวันทิ้ง รอใบของวันถัดไป (ยิงจาก cron-job.org · ต้องมี Bearer CRON_SECRET)
import { createApp, cronAuthorized } from '../../src/app.js';
import { clearDaily } from '../../src/notify/interactions.js';

export async function GET(req: Request): Promise<Response> {
  const app = await createApp();
  try {
    if (!cronAuthorized(req, app.cronSecret)) return new Response('unauthorized', { status: 401 });
    return Response.json(await clearDaily(app));
  } finally {
    await app.close();
  }
}
