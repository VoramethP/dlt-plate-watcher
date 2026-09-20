// ปิง 09:50 ก่อนเปิดจอง — ยิงจาก cron-job.org (Vercel Hobby cron คลาดได้ ±59 นาที ใช้กับอันนี้ไม่ได้)
// ไม่มีการเช็คสถานะจากเว็บขนส่ง อิงเวลา 10:00 ตามประกาศบนหน้าเว็บอย่างเดียว (ADR-0003)
import { createApp, cronAuthorized } from '../../src/app.js';
import { runOpeningPing } from '../../src/core.js';
import { sendPanel } from '../../src/notify/interactions.js';
import { restNotifier } from '../../src/notify/rest.js';

export async function GET(req: Request): Promise<Response> {
  const app = await createApp();
  try {
    if (!cronAuthorized(req, app.cronSecret)) return new Response('unauthorized', { status: 401 });
    const notifier = restNotifier(app.rest, { channelId: app.channelId, afterSend: () => sendPanel(app) });
    const r = await runOpeningPing(await app.config(), { store: app.store, notifier });
    return Response.json({ sent: r.sent.length });
  } finally {
    await app.close();
  }
}
