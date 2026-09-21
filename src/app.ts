// ประกอบของทั้งหมดจาก env สำหรับ api/ บน Vercel — ที่เดียวที่อ่าน process.env ฝั่ง serverless
// (cli.ts ทำหน้าที่เดียวกันสำหรับบนเครื่อง)
import { loadAuctionRules } from './auction.js';
import { resolveConfig } from './config.js';
import { loadNumerology } from './numerology.js';
import type { InteractionDeps } from './notify/interactions.js';
import { discordRest } from './notify/rest.js';
import { createStore } from './store.js';

const required = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`ยังไม่ได้ตั้ง env ${name} บน Vercel — ดู .env.example`);
  return v;
};

export interface App extends InteractionDeps {
  publicKey: string;
  cronSecret: string;
  /** 'all' = กวาดข้อความของทุกคนตอน 09:30 (ต้องมีสิทธิ์ Manage Messages) · 'bot' = เฉพาะของ bot เอง */
  sweepScope: 'bot' | 'all';
  close: () => Promise<void>;
}

export async function createApp(): Promise<App> {
  const store = await createStore({
    statePath: '/tmp/dlt-plate-watcher-state.json', // ใช้เฉพาะตอนไม่มี DATABASE_URL (ทดสอบ) — บน Vercel ควรมี DB เสมอ
    configPath: 'watch.config.json',
    databaseUrl: process.env.DATABASE_URL,
  });
  return {
    store,
    rest: discordRest(required('DISCORD_BOT_TOKEN')),
    channelId: required('DISCORD_CHANNEL_ID'),
    publicKey: required('DISCORD_PUBLIC_KEY'),
    sweepScope: process.env.DAILY_SWEEP === 'all' ? 'all' : 'bot',
    cronSecret: process.env.CRON_SECRET ?? '', // ว่าง = cron ปิดอยู่ (ปุ่มยังทำงาน) · cronAuthorized ไม่ยอมรับค่าว่าง
    config: () => resolveConfig({ configPath: 'watch.config.json', store }),
    numerology: () => loadNumerology(),
    auction: () => loadAuctionRules(),
    close: () => store.close?.() ?? Promise.resolve(),
  };
}

/** cron endpoint ยอมรับเฉพาะ `Authorization: Bearer $CRON_SECRET` (Vercel Cron ใส่ให้เอง · cron-job.org ตั้ง header เอง) */
export const cronAuthorized = (req: Request, secret: string) => Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`;
