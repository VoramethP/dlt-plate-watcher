// route interaction จาก Discord (ปุ่ม · modal · /panel) — เวอร์ชัน HTTP ของ bot.ts เดิม (ADR-0005)
// คืน response ที่ต้องตอบภายใน 3 วิ + งานที่ทำต่อหลังตอบ (api/interactions.ts โยนเข้า waitUntil)
// ไม่มีโค้ดที่แตะ Discord โดยตรงนอกจากผ่าน DiscordRest · ตรรกะ pure อยู่ใน actions.ts
import type { Config } from '../config.js';
import { isStale, loadSchedule, runCheck, type Env } from '../core.js';
import { matchSchedule } from '../match.js';
import { meaningLine, type Numerology } from '../numerology.js';
import type { Schedule } from '../schedule/types.js';
import { HISTORY_KINDS, type Actor, type Store } from '../store.js';
import { todayBangkok } from '../thai-date.js';
import {
  applyWishlistChange, BUTTON, clampReply, COMMAND, embedToText, formatHistory, MODAL, MODAL_TEXT, panelRows, parseNumbers, shareRow, wishlistChangeText,
} from './actions.js';
import { guideEmbeds, matchEmbed, panelEmbed, scheduleEmbed, wishlistEmbed, type Embed } from './discord.js';
import { createMessage, deleteMessage, deleteOwnMessages, editOriginal, pinQuietly, restNotifier, type DiscordRest } from './rest.js';

// --- รูปร่างของ interaction เท่าที่ใช้ (ไม่ดึง discord-api-types มาเพื่อ 6 field) ---
export const InteractionType = { PING: 1, APPLICATION_COMMAND: 2, MESSAGE_COMPONENT: 3, MODAL_SUBMIT: 5 } as const;
export const ResponseType = { PONG: 1, CHANNEL_MESSAGE: 4, DEFERRED_CHANNEL_MESSAGE: 5, MODAL: 9 } as const;
const EPHEMERAL = 64;

export interface Interaction {
  type: number;
  id: string;
  application_id: string;
  token: string;
  channel_id?: string;
  data?: {
    name?: string;
    custom_id?: string;
    components?: Array<{ components: Array<{ custom_id: string; value?: string }> }>;
  };
  message?: { id: string; author: { id: string }; embeds?: Array<{ title?: string; description?: string; fields?: Array<{ name: string; value: string }> }> };
  member?: { user: DiscordUser; nick?: string | null };
  user?: DiscordUser;
}
interface DiscordUser { id: string; username: string; global_name?: string | null }

export interface InteractionResult {
  /** JSON ที่ตอบกลับ Discord ทันที */
  response: Record<string, unknown>;
  /** งานที่ทำต่อหลังตอบ (แล้ว PATCH @original) — ไม่มี = ตอบจบในตัว */
  work?: () => Promise<void>;
}

export interface InteractionDeps {
  rest: DiscordRest;
  store: Store;
  channelId: string;
  config: () => Promise<Config>;
  schedule?: (fileId: string) => Promise<Schedule>;
  numerology: () => Promise<Numerology>;
  now?: Date;
  log?: (msg: string) => void;
}

export const PANEL_COMMAND = { name: 'panel', description: 'เรียกแผงควบคุม dlt-plate-watcher มาไว้ล่างสุด' };

const actorOf = (i: Interaction): Actor => {
  const u = i.member?.user ?? i.user;
  return u ? { id: u.id, name: i.member?.nick || u.global_name || u.username } : { id: 'unknown', name: 'ไม่ทราบ' };
};
const deferred = () => ({ type: ResponseType.DEFERRED_CHANNEL_MESSAGE, data: { flags: EPHEMERAL } });
const ephemeral = (data: { content?: string; embeds?: Embed[]; components?: unknown[] }) => ({ type: ResponseType.CHANNEL_MESSAGE, data: { ...data, flags: EPHEMERAL } });

/** โพสต์แผงควบคุมไว้ล่างสุด: ลบอันเก่า (id ใน meta) → โพสต์ใหม่ → ปักหมุด */
export async function sendPanel(deps: InteractionDeps): Promise<void> {
  const log = deps.log ?? console.log;
  const c = await deps.config();
  const today = todayBangkok(deps.now);
  const s = await (deps.schedule ?? loadSchedule)(c.scheduleFileId).catch(() => null);
  const lastCheckAt = await deps.store.getMeta('lastCheckAt');
  const embed = panelEmbed({
    config: c, today, version: s?.version, lastCheckAt: lastCheckAt ? new Date(lastCheckAt) : undefined,
    entries: s ? s.entries.filter((e) => e.vehicleType === c.vehicleType) : [],
    matches: s ? matchSchedule(s.entries, c) : [],
    stale: s ? isStale(s, today) : false,
  });
  const oldId = await deps.store.getMeta('panelMessageId');
  if (oldId) await deleteMessage(deps.rest, deps.channelId, oldId).catch(() => undefined);
  const msg = await createMessage(deps.rest, deps.channelId, { embeds: [embed], components: panelRows() });
  await deps.store.setMeta('panelMessageId', msg.id);
  await pinQuietly(deps.rest, deps.channelId, msg.id, log);
  await deps.store.logEvent({ kind: 'panel', payload: { messageId: msg.id } });
}

export async function handleInteraction(i: Interaction, deps: InteractionDeps): Promise<InteractionResult> {
  const log = deps.log ?? console.log;
  const loadSched = deps.schedule ?? loadSchedule;
  const actor = actorOf(i);
  // งานหลังตอบ: ทำแล้ว PATCH · พลาดก็ PATCH ข้อความ error ให้คนกดเห็น ไม่ใช่ "ไม่ตอบสนอง"
  const followUp = (fn: () => Promise<string | { embeds: Embed[]; components?: unknown[] }>): InteractionResult => ({
    response: deferred(),
    work: async () => {
      try {
        const out = await fn();
        await editOriginal(deps.rest, i.application_id, i.token, typeof out === 'string' ? { content: clampReply(out) } : { embeds: out.embeds.slice(0, 10), components: out.components ?? [shareRow()] });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`interaction พลาด: ${msg}`);
        await editOriginal(deps.rest, i.application_id, i.token, { content: `❌ bot พลาด: ${msg}`.slice(0, 1900) }).catch(() => undefined);
      }
    },
  });

  if (i.type === InteractionType.PING) return { response: { type: ResponseType.PONG } };

  if (i.type === InteractionType.APPLICATION_COMMAND && i.data?.name === PANEL_COMMAND.name) {
    return followUp(async () => { await sendPanel(deps); return '🛠️ ย้ายแผงควบคุมมาไว้ล่างสุดแล้ว'; });
  }

  if (i.type === InteractionType.MESSAGE_COMPONENT) {
    const id = i.data?.custom_id ?? '';
    switch (id) {
      case COMMAND.guide: return { response: ephemeral({ embeds: guideEmbeds() }) };
      case COMMAND.schedule: return followUp(async () => {
        const c = await deps.config();
        return { embeds: [scheduleEmbed(await loadSched(c.scheduleFileId), { title: '📅 ตารางเปิดจองสัปดาห์นี้', config: c, today: todayBangkok(deps.now) })] };
      });
      case COMMAND.match: return followUp(async () => {
        const c = await deps.config();
        const matches = matchSchedule((await loadSched(c.scheduleFileId)).entries, c);
        const numerology = await deps.numerology();
        return matches.length ? { embeds: matches.map((m) => matchEmbed(m, numerology)) } : '🎯 รอบนี้ไม่มีเลขใน wishlist เปิดจอง · กด 🔢 บนแผงเพื่อเพิ่มเลข';
      });
      case COMMAND.check: return followUp(async () => {
        // เหมือน cron ทุกอย่าง (ปุ่มใต้การ์ด + ย้ายแผงตาม) ต่างแค่ actor ลง events เป็นคนกด
        const env: Env = { store: deps.store, actor, now: deps.now, log, schedule: deps.schedule, notifier: restNotifier(deps.rest, { channelId: deps.channelId, afterSend: () => sendPanel(deps) }) };
        const r = await runCheck(await deps.config(), env);
        return `🔄 เช็คแล้ว · ควรแจ้ง ${r.planned.length} · ส่งใหม่ ${r.sent.length} รายการ`;
      });
      case BUTTON.addNumber: return { response: { type: ResponseType.MODAL, data: addNumberModal() } };
      case BUTTON.showWishlist: return followUp(async () => {
        const c = await deps.config();
        const state = await deps.store.loadState();
        const entries = (await loadSched(c.scheduleFileId).catch(() => ({ entries: [] as Schedule['entries'] }))).entries.filter((e) => e.vehicleType === c.vehicleType);
        return { embeds: [wishlistEmbed(c, state.owners ?? {}, entries, todayBangkok(deps.now), await deps.numerology())] };
      });
      case BUTTON.share: {
        // ข้อความล้วนใน code block → desktop มีปุ่มคัดลอกมุมขวาบน · มือถือกดค้างเลือกคัดลอก
        const text = (i.message?.embeds ?? []).map(embedToText).filter(Boolean).join('\n\n') || '(ข้อความนี้ไม่มีเนื้อหาให้คัดลอก)';
        return { response: ephemeral({ content: `📤 คัดลอกได้เลย (ชี้เมาส์ที่กล่อง → ปุ่มคัดลอกมุมขวาบน · มือถือกดค้าง)\n\`\`\`\n${text.slice(0, 1800)}\n\`\`\`` }) };
      }
      case BUTTON.showHistory: return followUp(async () => formatHistory(await deps.store.recentEvents(15, HISTORY_KINDS)));
      case BUTTON.clearHistory: return followUp(async () => {
        const botId = i.message?.author.id ?? i.application_id;
        const deleted = await deleteOwnMessages(deps.rest, deps.channelId, botId, i.message?.id ?? '');
        // แผงเก่าอาจโดนลบไปด้วย — โพสต์ใหม่ให้อยู่ล่างสุด
        await sendPanel(deps);
        await deps.store.logEvent({ kind: 'clear', actor, payload: { deleted } });
        return `🧹 ลบข้อความเก่าของ bot ไป ${deleted} ข้อความ และย้ายแผงมาล่างสุดแล้ว`;
      });
      default: return { response: ephemeral({ content: 'ปุ่มนี้ยังไม่ได้ต่อคำสั่ง' }) };
    }
  }

  if (i.type === InteractionType.MODAL_SUBMIT && i.data?.custom_id === MODAL.addNumber) {
    return followUp(async () => {
      const field = (id: string) => i.data?.components?.flatMap((row) => row.components).find((c) => c.custom_id === id)?.value ?? '';
      const add = parseNumbers(field(MODAL.field));
      const remove = parseNumbers(field(MODAL.removeField));
      const exclude = parseNumbers(field(MODAL.excludeField));
      const current = await deps.store.loadWishlist();
      const change = applyWishlistChange(current, add.valid, remove.valid, exclude.valid);
      let ownersBefore: Record<string, string> = (await deps.store.loadState()).owners ?? {};
      if (change.changed) {
        ownersBefore = await deps.store.saveWishlist({ numbers: change.numbers, exclude: change.exclude, added: change.added, excluded: change.excluded, removed: change.removed }, actor);
        await deps.store.logEvent({ kind: 'wishlist', actor, payload: { added: change.added, removed: change.removed, excluded: change.excluded, unexcluded: change.unexcluded } });
      }
      const c = await deps.config();
      const entries = (await loadSched(c.scheduleFileId).catch(() => ({ entries: [] as Schedule['entries'] }))).entries.filter((e) => e.vehicleType === c.vehicleType);
      const numerology = await deps.numerology();
      const meanings: Record<number, string> = {};
      for (const n of change.added) { const slot = entries.find((e) => n >= e.from && n <= e.to); meanings[n] = meaningLine(slot?.prefix ?? '', n, numerology); }
      return wishlistChangeText(change, [...add.invalid, ...exclude.invalid, ...remove.invalid], ownersBefore, actor.name, entries, todayBangkok(deps.now), { patterns: c.wishlist.patterns, digitSums: c.wishlist.digitSums }, meanings);
    });
  }

  return { response: ephemeral({ content: 'ไม่รู้จัก interaction นี้' }) };
}

/** modal 3 ช่อง — ข้อความอยู่ใน MODAL_TEXT (มีเทสลิมิต 45/100 ตัวอักษร) · type 4 = text input · style 2 = paragraph */
export function addNumberModal() {
  const input = (custom_id: string, label: string, placeholder: string) => ({
    type: 1, components: [{ type: 4, custom_id, label, style: 2, placeholder, max_length: 300, required: false }],
  });
  return {
    custom_id: MODAL.addNumber,
    title: MODAL_TEXT.title,
    components: [
      input(MODAL.field, MODAL_TEXT.addLabel, MODAL_TEXT.addPlaceholder),
      input(MODAL.excludeField, MODAL_TEXT.excludeLabel, MODAL_TEXT.excludePlaceholder),
      input(MODAL.removeField, MODAL_TEXT.removeLabel, MODAL_TEXT.removePlaceholder),
    ],
  };
}
