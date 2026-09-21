// การ์ดประจำวัน 09:30 — ยิงจาก cron-job.org (ต้องตรงเวลา Vercel Hobby cron คลาด ±59 นาที)
// ลำดับสำคัญ: กวาดห้องก่อน → เช็คตาราง (ของใหม่จะได้ไม่โดนกวาด) → การ์ดประจำวัน → แผงลงมาล่างสุด
import { createApp, cronAuthorized } from '../../src/app.js';
import { runCheck } from '../../src/core.js';
import { sendDaily, sendPanel, sweepChannel } from '../../src/notify/interactions.js';
import { restNotifier } from '../../src/notify/rest.js';

export async function GET(req: Request): Promise<Response> {
  const app = await createApp();
  try {
    if (!cronAuthorized(req, app.cronSecret)) return new Response('unauthorized', { status: 401 });
    const swept = await sweepChannel(app, app.sweepScope);
    const notifier = restNotifier(app.rest, { channelId: app.channelId, afterSend: () => sendPanel(app) });
    const r = await runCheck(await app.config(), { store: app.store, notifier });
    const daily = await sendDaily(app);
    // ไม่มีอะไรจะแจ้งและไม่มีการ์ด (เสาร์-อาทิตย์) ก็ยังต้องมีแผงในห้อง เพราะเพิ่งกวาดไป
    if (!daily.posted && !r.sent.length && swept.deleted) await sendPanel(app);
    return Response.json({ version: r.schedule.version, planned: r.planned.length, sent: r.sent.length, swept, daily });
  } finally {
    await app.close();
  }
}
