// Discord REST ด้วย bot token — ส่งข้อความ/แผง/ลบข้อความโดยไม่ต้องมี gateway (ADR-0005)
// แตะแค่ discord.com · ไม่ log token ไม่ใส่ token ในข้อความ error
import type { Fetcher } from '../schedule/fetch.js';
import { buttonRows } from './actions.js';
import type { Embed, Notifier } from './discord.js';

const API = 'https://discord.com/api/v10';

export interface DiscordRest {
  request<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
}

export function discordRest(token: string, fetcher: Fetcher = fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): DiscordRest {
  const call = (method: string, path: string, body?: unknown) => fetcher(`${API}${path}`, {
    method,
    headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    async request<T>(method: string, path: string, body?: unknown): Promise<T> {
      let res = await call(method, path, body);
      // 429 = ยิงถี่เกิน (ลบข้อความมีลิมิตเข้มเป็นพิเศษ) — รอตามที่ Discord บอกแล้วลองใหม่ครั้งเดียว
      // เคยทำแผงเก่าค้างในห้อง 21 ก.ย.: กด 🧹 แล้ว cron ลบแผงตามไม่ทัน โดน 429 แล้วเงียบไป (catch)
      if (res.status === 429) {
        const wait = Number((await res.clone().json().catch(() => ({}))).retry_after ?? 1);
        await sleep(Math.min(wait, 5) * 1000);
        res = await call(method, path, body);
      }
      // path ของ follow-up มี token ของ interaction — ห้ามโผล่ในข้อความ error ที่ส่งกลับไปในช่อง
      if (!res.ok) throw new Error(`Discord ${method} ${redactPath(path)} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
  };
}

/** ปิดทั้ง app id และ token — ไม่บังคับว่า app id ต้องเป็นตัวเลข เพื่อไม่ให้มีทางหลุดถ้ารูปแบบ path เปลี่ยน */
export const redactPath = (path: string) => path.replace(/^\/webhooks\/[^/]+\/[^/]+/, '/webhooks/***');

export interface MessageRef { id: string; author: { id: string }; type: number }

export const createMessage = (rest: DiscordRest, channelId: string, body: { content?: string; embeds?: Embed[]; components?: unknown[] }) =>
  rest.request<MessageRef>('POST', `/channels/${channelId}/messages`, body);
export const deleteMessage = (rest: DiscordRest, channelId: string, messageId: string) =>
  rest.request('DELETE', `/channels/${channelId}/messages/${messageId}`);
/** ข้อความเพิ่มของ interaction เดิม (ephemeral) — ใช้เมื่อ embed ชุดเดียวยาวเกิน 6000 ต้องแยกข้อความ */
export const createFollowup = (rest: DiscordRest, appId: string, token: string, body: { content?: string; embeds?: Embed[]; components?: unknown[] }) =>
  rest.request('POST', `/webhooks/${appId}/${token}`, { ...body, flags: 64 });

/** follow-up ของ interaction ที่ตอบ deferred ไปแล้ว — ใช้ token ของ interaction ไม่ใช่ bot token แต่ path เดียวกัน */
export const editOriginal = (rest: DiscordRest, appId: string, token: string, body: { content?: string; embeds?: Embed[]; components?: unknown[] }) =>
  rest.request('PATCH', `/webhooks/${appId}/${token}/messages/@original`, body);

/** ปักหมุดแล้วลบข้อความระบบ "ปักหมุดข้อความ" ทิ้ง (type 6) จะได้ไม่รก · ไม่มีสิทธิ์ Pin ก็ข้าม */
export async function pinQuietly(rest: DiscordRest, channelId: string, messageId: string, log: (m: string) => void) {
  try {
    await rest.request('PUT', `/channels/${channelId}/pins/${messageId}`);
    const recent = await rest.request<MessageRef[]>('GET', `/channels/${channelId}/messages?limit=3`);
    for (const m of recent) if (m.type === 6) await deleteMessage(rest, channelId, m.id).catch(() => undefined);
  } catch (err) {
    log(`ปักหมุดแผงไม่ได้: ${err instanceof Error ? err.message : err}`);
  }
}

export interface SweepOptions {
  /** ข้อความของ bot เอง — ต้องใส่เมื่อ scope = 'bot' */
  botUserId?: string;
  /** id ที่ห้ามลบ (ข้อความที่ผู้ใช้เพิ่งกดปุ่ม หรือแผงที่เพิ่งโพสต์) */
  keep?: string[];
  /** 'bot' = เฉพาะของ bot (ปุ่ม 🧹) · 'all' = ทุกคนในช่อง (ต้องมีสิทธิ์ Manage Messages · ตั้งด้วย DAILY_SWEEP=all) */
  scope?: 'bot' | 'all';
}

/**
 * กวาดข้อความในช่อง (สูงสุด 100 ข้อความล่าสุด)
 * bulk-delete ใช้ได้กับข้อความ < 14 วันและ ≥ 2 ข้อความ ที่เหลือลบทีละอัน · ไม่มีสิทธิ์ = คืน blocked ไม่ใช่โยนทิ้ง
 */
export async function sweepMessages(rest: DiscordRest, channelId: string, opts: SweepOptions): Promise<{ deleted: number; blocked: boolean }> {
  const keep = new Set(opts.keep ?? []);
  const fetched = await rest.request<MessageRef[]>('GET', `/channels/${channelId}/messages?limit=100`);
  const target = fetched.filter((m) => !keep.has(m.id) && (opts.scope === 'all' || m.author.id === opts.botUserId));
  if (!target.length) return { deleted: 0, blocked: false };
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recent = target.filter((m) => snowflakeTime(m.id) > twoWeeksAgo);
  const old = target.filter((m) => snowflakeTime(m.id) <= twoWeeksAgo);
  let blocked = false;
  const one = async (id: string) => {
    try { await deleteMessage(rest, channelId, id); return true; } catch (err) {
      if (/HTTP 403/.test(err instanceof Error ? err.message : '')) blocked = true; // ไม่มีสิทธิ์ลบของคนอื่น
      return false;
    }
  };
  let deleted = 0;
  if (recent.length >= 2) {
    try { await rest.request('POST', `/channels/${channelId}/messages/bulk-delete`, { messages: recent.map((m) => m.id) }); deleted += recent.length; }
    catch { for (const m of recent) if (await one(m.id)) deleted++; } // bulk พลาด (สิทธิ์/ข้อความเก่า) → ลองทีละอัน
  } else {
    for (const m of recent) if (await one(m.id)) deleted++;
  }
  for (const m of old) if (await one(m.id)) deleted++;
  return { deleted, blocked };
}

/** ปุ่ม 🧹 — ลบเฉพาะข้อความของ bot เอง ไม่แตะของคนอื่นไม่ว่าจะตั้ง DAILY_SWEEP ไว้ยังไง */
export const deleteOwnMessages = async (rest: DiscordRest, channelId: string, botUserId: string, keepId: string) =>
  (await sweepMessages(rest, channelId, { botUserId, keep: [keepId], scope: 'bot' })).deleted;

/** id ของ bot = application id · ถามครั้งเดียวตอน cron กวาดห้อง (ไม่มี interaction ให้ดู author) */
export const botUserId = async (rest: DiscordRest) => (await rest.request<{ id: string }>('GET', '/users/@me')).id;

/** เวลาสร้างจาก snowflake — Discord epoch 2015-01-01 */
export const snowflakeTime = (id: string) => Number(BigInt(id) >> 22n) + 1420070400000;

export interface RestNotifierOptions {
  channelId: string;
  /** โพสต์แผงใหม่ไว้ล่างสุดหลังส่ง (cron ใช้ · คำสั่งครั้งเดียวไม่ควรโพสต์แผงซ้อน) */
  afterSend?: () => Promise<void>;
}

/** Notifier สำหรับ core.ts — ข้อความแจ้งเตือนมีปุ่ม 📤/🌐 ใต้การ์ด */
export function restNotifier(rest: DiscordRest, opts: RestNotifierOptions): Notifier {
  let sent = false;
  return {
    async send(embeds: Embed[]) {
      await createMessage(rest, opts.channelId, { embeds, components: buttonRows() });
      sent = true;
    },
    // แผงต้องขยับครั้งเดียวตอนจบ — ไม่งั้นแจ้งหลายข้อความ = โพสต์/ลบแผงหลายรอบ
    async done() { if (sent) await opts.afterSend?.(); },
  };
}
