// การ์ดประจำวัน 09:30 — ยิงจาก cron-job.org (ต้องตรงเวลา Vercel Hobby cron คลาด ±59 นาที)
// เช็คตารางให้ด้วยในตัว เผื่อขนส่งเพิ่งอัปไฟล์หลัง cron 08:00 (เคยพลาดมาแล้ว 21 ก.ย. ไฟล์มา 08:44)
import { createApp, cronAuthorized } from '../../src/app.js';
import { runCheck } from '../../src/core.js';
import { sendDaily, sendPanel } from '../../src/notify/interactions.js';
import { restNotifier } from '../../src/notify/rest.js';

export async function GET(req: Request): Promise<Response> {
  const app = await createApp();
  try {
    if (!cronAuthorized(req, app.cronSecret)) return new Response('unauthorized', { status: 401 });
    const notifier = restNotifier(app.rest, { channelId: app.channelId, afterSend: () => sendPanel(app) });
    const r = await runCheck(await app.config(), { store: app.store, notifier });
    const daily = await sendDaily(app);
    return Response.json({ version: r.schedule.version, planned: r.planned.length, sent: r.sent.length, daily });
  } finally {
    await app.close();
  }
}
