// งานหลักที่ CLI และ cron เรียกใช้ — แยกจาก cli.ts เพื่อให้เทสได้โดยไม่ต้อง spawn process
import type { Config } from './config.js';
import { matchSchedule, type Match } from './match.js';
import { matchEmbed, openingSoonEmbed, reminderEmbed, scheduleEmbed, staleEmbed, type Embed, type Notifier } from './notify/discord.js';
import { fetchSchedulePdf, type Fetcher } from './schedule/fetch.js';
import { parseSchedulePdf } from './schedule/parse.js';
import type { Schedule, ScheduleEntry } from './schedule/types.js';
import { loadState, saveState, type State } from './state.js';
import { daysBetween, todayBangkok } from './thai-date.js';
import { loadNumerology, type Numerology } from './numerology.js';
import { createHash } from 'node:crypto';

export interface Env {
  /** ไม่มี = โหมด dry-run พิมพ์ embed ออกจอแทน */
  notifier?: Notifier;
  statePath: string;
  fetcher?: Fetcher;
  now?: Date;
  log?: (msg: string) => void;
}

export async function loadSchedule(fileId: string, fetcher: Fetcher = fetch): Promise<Schedule> {
  const pdf = await fetchSchedulePdf(fileId, fetcher);
  const entries = await parseSchedulePdf(pdf.bytes);
  // ไม่มี Last-Modified ก็ใช้วันเปิดจองแรกแทน — ยังแยกสัปดาห์ได้
  const version = pdf.lastModified ?? entries.map((e) => e.openDate).sort()[0];
  return { sourceFileId: fileId, version, fetchedAt: new Date().toISOString(), entries };
}

/** wishlist เปลี่ยน = ต้องแจ้งช่วงเดิมใหม่ จึงผูก key กับ hash ของ wishlist ด้วย */
export const wishlistHash = (w: Config['wishlist']) =>
  createHash('sha1').update(JSON.stringify([w.numbers, w.patterns, w.digitSums])).digest('hex').slice(0, 8);
export const matchKey = (m: Match, w: Config['wishlist']) =>
  `match:${m.entry.openDate}:${m.entry.prefix}:${m.entry.from}-${m.entry.to}:${wishlistHash(w)}`;
export const reminderKey = (kind: string, e: ScheduleEntry, d: number) => `${kind}:${e.openDate}:${e.prefix}:${e.from}:${d}`;

/** ตารางหมดอายุ = ทุกวันเปิดจองผ่านไปแล้ว → ต้องไปเอา file id ใหม่จากหน้าขนส่ง */
export function isStale(schedule: Schedule, today: string): boolean {
  return schedule.entries.every((e) => daysBetween(today, e.openDate) < 0);
}

/** สิ่งที่ควรแจ้งวันนี้ โดยยังไม่ตัดของที่เคยแจ้งไปแล้ว */
export function planNotifications(schedule: Schedule, config: Config, state: State, today: string, numerology?: Numerology) {
  const out: Array<{ key: string; embed: Embed }> = [];
  const stale = isStale(schedule, today);
  const mine = schedule.entries.filter((e) => e.vehicleType === config.vehicleType);

  if (stale) {
    // ตารางเก่า: ไม่มีอะไรให้ match แต่กำหนดจดทะเบียนของรอบนี้ยังเดินอยู่ ต้องเตือนต่อ
    out.push({ key: `stale:${schedule.sourceFileId}`, embed: staleEmbed(schedule) });
  } else {
    if (state.lastScheduleVersion && state.lastScheduleVersion !== schedule.version) {
      out.push({ key: `schedule:${schedule.version}`, embed: scheduleEmbed(schedule) });
    }
    for (const m of matchSchedule(schedule.entries, config)) {
      if (daysBetween(today, m.entry.openDate) < 0) continue; // ผ่านไปแล้ว ไม่ต้องแจ้ง
      out.push({ key: matchKey(m, config.wishlist), embed: matchEmbed(m, numerology) });
    }
    for (const e of mine) {
      const untilOpen = daysBetween(today, e.openDate);
      if (config.reminders.daysBeforeOpen.includes(untilOpen)) {
        out.push({ key: reminderKey('open', e, untilOpen), embed: reminderEmbed('open', e, untilOpen) });
      }
    }
  }

  for (const e of mine) {
    const untilDeadline = daysBetween(today, e.registerBy);
    if (config.reminders.daysBeforeRegisterDeadline.includes(untilDeadline)) {
      out.push({ key: reminderKey('deadline', e, untilDeadline), embed: reminderEmbed('deadline', e, untilDeadline) });
    }
  }
  return out;
}

/** Discord รับได้สูงสุด 10 embed ต่อข้อความ */
async function sendInChunks(notifier: Notifier, embeds: Embed[]) {
  for (let i = 0; i < embeds.length; i += 10) await notifier.send(embeds.slice(i, i + 10));
}

async function sendFresh(planned: Array<{ key: string; embed: Embed }>, state: State, env: Env) {
  const log = env.log ?? console.log;
  const fresh = planned.filter((p) => !state.notified.includes(p.key));
  if (fresh.length && env.notifier) {
    await sendInChunks(env.notifier, fresh.map((p) => p.embed));
  } else if (fresh.length) {
    log('ไม่มีปลายทาง Discord (dry-run หรือยังไม่ตั้ง .env) — พิมพ์แทนการส่ง');
    for (const p of fresh) log(JSON.stringify(p.embed, null, 2));
  }
  return fresh;
}

/** รอบเช็คหนึ่งครั้ง: ดึงตาราง → หาเรื่องที่ต้องแจ้ง → ส่งเฉพาะที่ยังไม่เคยส่ง → บันทึก state */
export async function runCheck(config: Config, env: Env) {
  const log = env.log ?? console.log;
  const today = todayBangkok(env.now);
  const schedule = await loadSchedule(config.scheduleFileId, env.fetcher);
  const state = await loadState(env.statePath);

  const planned = planNotifications(schedule, config, state, today, await loadNumerology());
  const sent = await sendFresh(planned, state, env);
  log(`ตารางเวอร์ชัน ${schedule.version}: ${schedule.entries.length} แถว · ควรแจ้ง ${planned.length} · ส่งใหม่ ${sent.length}`);

  await saveState(env.statePath, {
    ...state,
    lastScheduleVersion: schedule.version,
    notified: [...state.notified, ...sent.map((p) => p.key)],
  });
  return { schedule, planned, sent };
}

/**
 * ปิงก่อนเปิดจอง (ใช้ใน watch ตอน 09:50) — เฉพาะวันที่มีเลขใน wishlist เปิด
 * ไม่มีการเช็คสถานะจากเว็บขนส่ง อิงเวลา 10:00 ตามประกาศบนหน้าเว็บอย่างเดียว
 */
export async function runOpeningPing(config: Config, env: Env) {
  const today = todayBangkok(env.now);
  const schedule = await loadSchedule(config.scheduleFileId, env.fetcher);
  const state = await loadState(env.statePath);
  const todays = matchSchedule(schedule.entries, config).filter((m) => m.entry.openDate === today);
  const planned = todays.map((m) => ({ key: `t10:${today}:${m.entry.prefix}`, embed: openingSoonEmbed(m) }));
  const sent = await sendFresh(planned, state, env);
  if (sent.length) await saveState(env.statePath, { ...state, notified: [...state.notified, ...sent.map((p) => p.key)] });
  return { sent };
}

/** ส่ง match embed ของรอบนี้ทั้งหมดทันที ไม่อ่าน/ไม่เขียน state — เอาไว้ดูหน้าตาข้อความหลังแก้ดีไซน์ */
export async function runPreview(config: Config, env: Env) {
  const schedule = await loadSchedule(config.scheduleFileId, env.fetcher);
  const numerology = await loadNumerology();
  const embeds = matchSchedule(schedule.entries, config).map((m) => matchEmbed(m, numerology));
  if (!embeds.length) return { sent: 0 };
  if (!env.notifier) {
    (env.log ?? console.log)(JSON.stringify(embeds, null, 2));
    return { sent: 0 };
  }
  await sendInChunks(env.notifier, embeds);
  return { sent: embeds.length };
}
