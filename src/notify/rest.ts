// Discord REST ด้วย bot token — ส่งข้อความ/แผง/ลบข้อความโดยไม่ต้องมี gateway (ADR-0005)
// แตะแค่ discord.com · ไม่ log token ไม่ใส่ token ในข้อความ error
import type { Fetcher } from '../schedule/fetch.js';
import { buttonRows } from './actions.js';
import type { Embed, Notifier } from './discord.js';

const API = 'https://discord.com/api/v10';

export interface DiscordRest {
  request<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
}

export function discordRest(token: string, fetcher: Fetcher = fetch): DiscordRest {
  return {
    async request<T>(method: string, path: string, body?: unknown): Promise<T> {
      const res = await fetcher(`${API}${path}`, {
        method,
        headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      // path ของ follow-up มี token ของ interaction — ห้ามโผล่ในข้อความ error ที่ส่งกลับไปในช่อง
      if (!res.ok) throw new Error(`Discord ${method} ${redactPath(path)} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
  };
}

export const redactPath = (path: string) => path.replace(/^\/webhooks\/\d+\/[^/]+/, '/webhooks/***');

export interface MessageRef { id: string; author: { id: string }; type: number }

export const createMessage = (rest: DiscordRest, channelId: string, body: { content?: string; embeds?: Embed[]; components?: unknown[] }) =>
  rest.request<MessageRef>('POST', `/channels/${channelId}/messages`, body);
export const deleteMessage = (rest: DiscordRest, channelId: string, messageId: string) =>
  rest.request('DELETE', `/channels/${channelId}/messages/${messageId}`);
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

/** ลบข้อความของ bot เองในช่อง (ยกเว้น keepId) · bulk-delete ใช้ได้กับข้อความ < 14 วันและ ≥ 2 ข้อความ ที่เหลือลบทีละอัน */
export async function deleteOwnMessages(rest: DiscordRest, channelId: string, botUserId: string, keepId: string): Promise<number> {
  const fetched = await rest.request<MessageRef[]>('GET', `/channels/${channelId}/messages?limit=100`);
  const mine = fetched.filter((m) => m.author.id === botUserId && m.id !== keepId);
  if (!mine.length) return 0;
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recent = mine.filter((m) => snowflakeTime(m.id) > twoWeeksAgo);
  const old = mine.filter((m) => snowflakeTime(m.id) <= twoWeeksAgo);
  if (recent.length >= 2) await rest.request('POST', `/channels/${channelId}/messages/bulk-delete`, { messages: recent.map((m) => m.id) });
  else for (const m of recent) await deleteMessage(rest, channelId, m.id).catch(() => undefined);
  for (const m of old) await deleteMessage(rest, channelId, m.id).catch(() => undefined);
  return mine.length;
}

/** เวลาสร้างจาก snowflake — Discord epoch 2015-01-01 */
export const snowflakeTime = (id: string) => Number(BigInt(id) >> 22n) + 1420070400000;

export interface RestNotifierOptions {
  channelId: string;
  /** โพสต์แผงใหม่ไว้ล่างสุดหลังส่ง (cron ใช้ · คำสั่งครั้งเดียวไม่ควรโพสต์แผงซ้อน) */
  afterSend?: () => Promise<void>;
}

/** Notifier สำหรับ core.ts — ข้อความแจ้งเตือนมีปุ่ม 📤/🌐 ใต้การ์ด */
export function restNotifier(rest: DiscordRest, opts: RestNotifierOptions): Notifier {
  return {
    async send(embeds: Embed[]) {
      await createMessage(rest, opts.channelId, { embeds, components: buttonRows() });
      await opts.afterSend?.();
    },
  };
}
