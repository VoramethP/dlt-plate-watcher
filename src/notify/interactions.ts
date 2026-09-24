// route interaction จาก Discord (ปุ่ม · modal · /panel) — เวอร์ชัน HTTP ของ bot.ts เดิม (ADR-0005)
// คืน response ที่ต้องตอบภายใน 3 วิ + งานที่ทำต่อหลังตอบ (api/interactions.ts โยนเข้า waitUntil)
// ไม่มีโค้ดที่แตะ Discord โดยตรงนอกจากผ่าน DiscordRest · ตรรกะ pure อยู่ใน actions.ts
import { auctionIndex, loadAuctionRules, type AuctionIndex, type AuctionRules } from '../auction.js';
import type { Config } from '../config.js';
import { isStale, loadSchedule, runCheck, type Env } from '../core.js';
import { matchSchedule } from '../match.js';
import { meaningLine, type Numerology } from '../numerology.js';
import type { Schedule } from '../schedule/types.js';
import { HISTORY_KINDS, type Actor, type Store } from '../store.js';
import { todayBangkok } from '../thai-date.js';
import {
  applyWishlistChange, BUTTON, clampReply, COMMAND, dailyRows, embedToText, formatHistory, MODAL, MODAL_TEXT, panelRows, parseNumbers, shareRow, wishlistChangeText,
  WON_MODAL, WON_TEXT, wonChangeText,
} from './actions.js';
import { applyWonChange, loadWon, parseDeadline, saveWon } from '../won.js';
import { chunkEmbeds, dailyEmbed, guideEmbeds, matchEmbed, panelEmbed, scheduleEmbed, wishlistEmbed, type Embed } from './discord.js';
import { composeDaily } from '../daily.js';
import { botUserId, createFollowup, createMessage, deleteMessage, deleteOwnMessages, editOriginal, pinQuietly, restNotifier, sweepMessages, type DiscordRest } from './rest.js';

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
  /** กฎเลขประมูล — ไม่ส่งมา = อ่าน auction-rules.json (ADR-0006) */
  auction?: () => Promise<AuctionRules>;
  now?: Date;
  log?: (msg: string) => void;
}

export const PANEL_COMMAND = { name: 'panel', description: 'เรียกแผงควบคุม dlt-plate-watcher มาไว้ล่างสุด' };

/** กฎในไฟล์ + เลขที่ผู้ใช้ทำเครื่องหมายเองผ่านช่อง 🔨 */
const auctionOf = async (deps: InteractionDeps, c: Config): Promise<AuctionIndex> =>
  auctionIndex(await (deps.auction ?? loadAuctionRules)(), c.wishlist.auction);

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
  const auction = await auctionOf(deps, c);
  const embed = panelEmbed({
    config: c, today, version: s?.version, lastCheckAt: lastCheckAt ? new Date(lastCheckAt) : undefined,
    entries: s ? s.entries.filter((e) => e.vehicleType === c.vehicleType) : [],
    matches: s ? matchSchedule(s.entries, c, auction) : [],
    auctionCount: c.wishlist.numbers.filter((n) => auction.has(n)).length,
    stale: s ? isStale(s, today) : false,
  });
  const oldId = await deps.store.getMeta('panelMessageId');
  if (oldId) await deleteMessage(deps.rest, deps.channelId, oldId).catch(() => undefined);
  const msg = await createMessage(deps.rest, deps.channelId, { embeds: [embed], components: panelRows() });
  await deps.store.setMeta('panelMessageId', msg.id);
  await pinQuietly(deps.rest, deps.channelId, msg.id, log);
  await deps.store.logEvent({ kind: 'panel', payload: { messageId: msg.id } });
}

/**
 * ตอบ embed หลายใบให้คนกด — ข้อความเดียวรับได้ 10 ใบ/6000 ตัวอักษร ที่เหลือต่อเป็น follow-up (ephemeral เหมือนกัน)
 * ปุ่มอยู่ข้อความสุดท้ายใบเดียว จะได้ไม่มีปุ่ม 📤 ซ้ำกันหลายอัน
 */
async function replyEmbeds(rest: DiscordRest, i: Interaction, embeds: Embed[], components: unknown[]) {
  const chunks = chunkEmbeds(embeds);
  if (!chunks.length) chunks.push([]);
  for (const [idx, chunk] of chunks.entries()) {
    const body = { embeds: chunk, components: idx === chunks.length - 1 ? components : [] };
    if (idx === 0) await editOriginal(rest, i.application_id, i.token, body);
    else await createFollowup(rest, i.application_id, i.token, body);
  }
}

/** meta key ของการ์ดประจำวันใบล่าสุด — ใช้ลบตอน 23:50 หรือตอนโพสต์ใบใหม่ทับ */
const DAILY_KEY = 'dailyMessageId';

/**
 * 🧽 กวาดห้องก่อนเริ่มวันใหม่ (เรียกจาก cron 09:30 ก่อนโพสต์อะไร) — ห้องจะเหลือแค่ของวันนี้
 * scope 'all' ลบของทุกคน ต้องมีสิทธิ์ Manage Messages · ไม่มีสิทธิ์จะคืน blocked มาให้บอกผู้ใช้ ไม่ล้มทั้งรอบ
 */
export async function sweepChannel(deps: InteractionDeps, scope: 'bot' | 'all' = 'bot') {
  const r = await sweepMessages(deps.rest, deps.channelId, {
    scope,
    botUserId: scope === 'bot' ? await botUserId(deps.rest) : undefined,
  });
  if (r.deleted) await deps.store.logEvent({ kind: 'clear', payload: { deleted: r.deleted, scope, auto: true } });
  if (r.blocked) (deps.log ?? console.log)('กวาดห้องไม่ครบ: bot ไม่มีสิทธิ์ Manage Messages จึงลบข้อความของคนอื่นไม่ได้');
  // meta ที่ชี้ข้อความที่เพิ่งถูกกวาดไปแล้ว ต้องล้าง ไม่งั้นรอบหน้าไปลบ id ที่ไม่มีอยู่
  if (r.deleted) { await deps.store.setMeta(DAILY_KEY, ''); await deps.store.setMeta('panelMessageId', ''); }
  return r;
}

/**
 * 📣 โพสต์การ์ดประจำวันเข้าห้อง (ทุกคนเห็น) — เรียกจาก cron 09:30
 * ไม่โพสต์เมื่อ: ตารางหมดอายุ (ช่วงเลขไม่ใช่ของจริง) · วันนี้ไม่มีรอบเปิดของรถประเภทนี้ (เสาร์-อาทิตย์)
 */
export async function sendDaily(deps: InteractionDeps): Promise<{ posted: boolean; reason?: string }> {
  const c = await deps.config();
  const today = todayBangkok(deps.now);
  const schedule = await (deps.schedule ?? loadSchedule)(c.scheduleFileId);
  const made = composeDaily({
    config: c, schedule, today,
    numerology: await deps.numerology(),
    auction: await auctionOf(deps, c),
  });
  if ('skip' in made) return { posted: false, reason: made.skip };

  const old = await deps.store.getMeta(DAILY_KEY);
  if (old) await deleteMessage(deps.rest, deps.channelId, old).catch(() => undefined); // ใบเมื่อวานค้างอยู่ก็เก็บให้
  const msg = await createMessage(deps.rest, deps.channelId, { embeds: [made.embed], components: dailyRows() });
  await deps.store.setMeta(DAILY_KEY, msg.id);
  await deps.store.logEvent({ kind: 'daily', payload: { messageId: msg.id, date: today, mine: made.mine, suggested: made.suggested } });
  await sendPanel(deps); // แผงลงมาล่างสุดตามเดิม
  return { posted: true };
}

/**
 * 🌙 จบวัน 23:50 — ลบการ์ดประจำวันทิ้งเพื่อรอใบของวันถัดไป
 * ข้อความหายไปแล้ว (404) = สำเร็จ (อาจโดน 🧹 ไปก่อน) · พลาดด้วยเหตุอื่น **ต้องบอก** และเก็บ id ไว้ลองใหม่
 * (เคยตอบ deleted:true ทั้งที่ลบไม่ผ่าน เพราะ .catch() กลืน error — 21 ก.ย.)
 */
export async function clearDaily(deps: InteractionDeps): Promise<{ deleted: boolean; error?: string }> {
  const id = await deps.store.getMeta(DAILY_KEY);
  if (!id) return { deleted: false };
  try {
    await deleteMessage(deps.rest, deps.channelId, id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/HTTP 404/.test(msg)) {
      (deps.log ?? console.log)(`ลบการ์ดประจำวันไม่ได้: ${msg}`);
      return { deleted: false, error: msg }; // ไม่ล้าง meta — 23:50 วันถัดไป (หรือการโพสต์ใบใหม่) จะลองอีกที
    }
  }
  await deps.store.setMeta(DAILY_KEY, '');
  await deps.store.logEvent({ kind: 'daily', payload: { cleared: true, messageId: id } });
  return { deleted: true };
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
        if (typeof out === 'string') await editOriginal(deps.rest, i.application_id, i.token, { content: clampReply(out) });
        else await replyEmbeds(deps.rest, i, out.embeds, out.components ?? [shareRow()]);
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
        return { embeds: [scheduleEmbed(await loadSched(c.scheduleFileId), { title: '📅 ตารางเปิดจองสัปดาห์นี้', config: c, today: todayBangkok(deps.now), auction: await auctionOf(deps, c) })] };
      });
      case COMMAND.match: return followUp(async () => {
        const c = await deps.config();
        const matches = matchSchedule((await loadSched(c.scheduleFileId)).entries, c, await auctionOf(deps, c));
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
      case BUTTON.wonNumber: return { response: { type: ResponseType.MODAL, data: wonModal() } };
      case BUTTON.showWishlist: return followUp(async () => {
        const c = await deps.config();
        const state = await deps.store.loadState();
        const entries = (await loadSched(c.scheduleFileId).catch(() => ({ entries: [] as Schedule['entries'] }))).entries.filter((e) => e.vehicleType === c.vehicleType);
        return { embeds: [wishlistEmbed(c, state.owners ?? {}, entries, todayBangkok(deps.now), await deps.numerology(), await auctionOf(deps, c), await loadWon(deps.store))] };
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

  if (i.type === InteractionType.MODAL_SUBMIT && i.data?.custom_id === WON_MODAL.id) {
    return followUp(async () => {
      const field = (id: string) => i.data?.components?.flatMap((row) => row.components).find((c) => c.custom_id === id)?.value?.trim() ?? '';
      const got = parseNumbers(field(WON_MODAL.number));
      const remove = parseNumbers(field(WON_MODAL.remove));
      const rawDate = field(WON_MODAL.deadline);
      const registerBy = rawDate ? parseDeadline(rawDate) : undefined;
      if (rawDate && !registerBy) return `❌ อ่านวันที่ "${rawDate}" ไม่ออก · ใส่แบบ 26/10/2569 หรือ 2026-10-26 หรือ "26 ตุลาคม 2569"`;

      const c = await deps.config();
      const today = todayBangkok(deps.now);
      // ตารางสัปดาห์นี้ใช้เดาหมวด/วันหมดเขตให้ (เคสปกติ: เพิ่งจองได้วันนี้) · โหลดไม่ได้ก็ยังบันทึกได้ถ้าผู้ใช้พิมพ์มาเอง
      const entries = (await (deps.schedule ?? loadSchedule)(c.scheduleFileId).catch(() => ({ entries: [] as Schedule['entries'] })))
        .entries.filter((e) => e.vehicleType === c.vehicleType);
      const change = applyWonChange(await loadWon(deps.store), {
        numbers: got.valid, remove: remove.valid, prefix: field(WON_MODAL.prefix) || undefined,
        registerBy: registerBy ?? undefined, by: actor.name, now: new Date(deps.now ?? Date.now()).toISOString(), entries,
      });
      if (change.changed) {
        await saveWon(deps.store, change.list);
        await deps.store.logEvent({ kind: 'won', actor, payload: { added: change.added.map((w) => w.number), removed: change.removed.map((w) => w.number) } });
      }
      return wonChangeText(change, [...got.invalid, ...remove.invalid], today, c.reminders.daysBeforeRegisterDeadline);
    });
  }

  if (i.type === InteractionType.MODAL_SUBMIT && i.data?.custom_id === MODAL.addNumber) {
    return followUp(async () => {
      const field = (id: string) => i.data?.components?.flatMap((row) => row.components).find((c) => c.custom_id === id)?.value ?? '';
      const add = parseNumbers(field(MODAL.field));
      const remove = parseNumbers(field(MODAL.removeField));
      const exclude = parseNumbers(field(MODAL.excludeField));
      const markAuction = parseNumbers(field(MODAL.auctionField));
      const current = await deps.store.loadWishlist();
      const change = applyWishlistChange(current, add.valid, remove.valid, exclude.valid, markAuction.valid);
      let ownersBefore: Record<string, string> = (await deps.store.loadState()).owners ?? {};
      if (change.changed) {
        ownersBefore = await deps.store.saveWishlist({ numbers: change.numbers, exclude: change.exclude, auction: change.auction, added: change.added, excluded: change.excluded, removed: change.removed, markedAuction: change.markedAuction }, actor);
        await deps.store.logEvent({ kind: 'wishlist', actor, payload: { added: change.added, removed: change.removed, excluded: change.excluded, unexcluded: change.unexcluded, markedAuction: change.markedAuction } });
      }
      const c = await deps.config();
      const entries = (await loadSched(c.scheduleFileId).catch(() => ({ entries: [] as Schedule['entries'] }))).entries.filter((e) => e.vehicleType === c.vehicleType);
      const numerology = await deps.numerology();
      const meanings: Record<number, string> = {};
      for (const n of change.added) { const slot = entries.find((e) => n >= e.from && n <= e.to); meanings[n] = meaningLine(slot?.prefix ?? '', n, numerology); }
      // เลขที่เพิ่งเพิ่มแล้วเป็นเลขประมูลตามกฎ → บอกทันทีในคำตอบ ไม่ต้องรอให้ไปเจอเองตอน 10:00
      const index = await auctionOf(deps, { ...c, wishlist: { ...c.wishlist, auction: change.auction } });
      const auctions: Record<number, string> = {};
      for (const n of change.added) { const g = index.get(n); if (g) auctions[n] = g; }
      return wishlistChangeText(change, [...add.invalid, ...exclude.invalid, ...remove.invalid, ...markAuction.invalid], ownersBefore, actor.name, entries, todayBangkok(deps.now), { patterns: c.wishlist.patterns, digitSums: c.wishlist.digitSums }, meanings, auctions);
    });
  }

  return { response: ephemeral({ content: 'ไม่รู้จัก interaction นี้' }) };
}

/** modal ของปุ่ม 🏆 — ช่องหมวด/วันหมดเขตเว้นว่างได้ bot หาจากตารางสัปดาห์นี้ให้ (ADR-0008) */
export function wonModal() {
  const input = (custom_id: string, label: string, placeholder: string) => ({
    type: 1, components: [{ type: 4, custom_id, label, style: 1, placeholder, max_length: 100, required: false }],
  });
  return {
    custom_id: WON_MODAL.id,
    title: WON_TEXT.title,
    components: [
      input(WON_MODAL.number, WON_TEXT.numberLabel, WON_TEXT.numberPlaceholder),
      input(WON_MODAL.deadline, WON_TEXT.deadlineLabel, WON_TEXT.deadlinePlaceholder),
      input(WON_MODAL.prefix, WON_TEXT.prefixLabel, WON_TEXT.prefixPlaceholder),
      input(WON_MODAL.remove, WON_TEXT.removeLabel, WON_TEXT.removePlaceholder),
    ],
  };
}

/** modal 4 ช่อง (Discord รับสูงสุด 5) — ข้อความอยู่ใน MODAL_TEXT (มีเทสลิมิต 45/100 ตัวอักษร) · type 4 = text input · style 2 = paragraph */
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
      input(MODAL.auctionField, MODAL_TEXT.auctionLabel, MODAL_TEXT.auctionPlaceholder),
      input(MODAL.removeField, MODAL_TEXT.removeLabel, MODAL_TEXT.removePlaceholder),
    ],
  };
}
