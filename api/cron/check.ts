// check 08:00 — Vercel Cron ยิง GET มาพร้อม Authorization: Bearer $CRON_SECRET (vercel.json)
import { createApp, cronAuthorized } from '../../src/app.js';
import { runCheck } from '../../src/core.js';
import { sendPanel } from '../../src/notify/interactions.js';
import { restNotifier } from '../../src/notify/rest.js';

export async function GET(req: Request): Promise<Response> {
  const app = await createApp();
  try {
    if (!cronAuthorized(req, app.cronSecret)) return new Response('unauthorized', { status: 401 });
    const notifier = restNotifier(app.rest, { channelId: app.channelId, afterSend: () => sendPanel(app) });
    const r = await runCheck(await app.config(), { store: app.store, notifier });
    return Response.json({ version: r.schedule.version, planned: r.planned.length, sent: r.sent.length });
  } finally {
    await app.close();
  }
}
