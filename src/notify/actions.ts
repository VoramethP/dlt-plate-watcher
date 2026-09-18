// ตรรกะของปุ่มใต้ข้อความ — pure ไม่แตะ discord.js เพื่อให้เทสได้
// ปุ่ม "กรอกเลขที่อยากจอง" แค่เพิ่มเลขลง wishlist ให้เฝ้า ไม่ได้จองแทน (ADR-0001)
import { readFile, writeFile } from 'node:fs/promises';
import { DLT_RESERVE_PAGE } from '../schedule/fetch.js';
import { loadState, saveState, type State } from '../state.js';
import type { ScheduleEntry } from '../schedule/types.js';
import { daysBetween } from '../thai-date.js';
import { formatThaiDate } from '../thai-date.js';

export const BUTTON = {
  addNumber: 'add_number',
  showHistory: 'show_history',
  clearHistory: 'clear_history',
} as const;
export const MODAL = { addNumber: 'add_number_modal', field: 'number', removeField: 'remove' } as const;

/** ข้อความใน modal — Discord จำกัด title/label ≤ 45 ตัวอักษร · placeholder ≤ 100 (เกินแล้ว discord.js โยน "Invalid string length" ก่อนส่ง → ปุ่มขึ้น "ไม่ตอบสนอง") */
export const MODAL_TEXT = {
  title: 'เลขที่อยากได้ (เฝ้าให้ ไม่ได้จองแทน)',
  addLabel: 'เพิ่มเลข 1–9999 (คั่นด้วย , หรือเว้นวรรค)',
  addPlaceholder: 'เช่น 5555, 6000 6464',
  removeLabel: 'ลบเลขที่กรอกผิด (ไม่ใส่ก็ได้)',
  removePlaceholder: 'เช่น 15',
} as const;
export const DISCORD_LIMITS = { modalTitle: 45, inputLabel: 45, placeholder: 100 } as const;

/** ปุ่มลัดของคำสั่ง CLI — อยู่บน "แผงควบคุม" ที่ bot โพสต์ตอนเริ่ม watch */
export const COMMAND = { schedule: 'cmd_schedule', match: 'cmd_match', check: 'cmd_check', status: 'cmd_status', guide: 'cmd_guide' } as const;
export type CommandId = (typeof COMMAND)[keyof typeof COMMAND];

export const COMMAND_BUTTONS = [
  { type: 2, style: 2, custom_id: COMMAND.schedule, label: 'ตารางสัปดาห์นี้', emoji: { name: '📅' } },
  { type: 2, style: 2, custom_id: COMMAND.match, label: 'เลขในฝันรอบนี้', emoji: { name: '🎯' } },
  { type: 2, style: 1, custom_id: COMMAND.check, label: 'เช็คตอนนี้', emoji: { name: '🔄' } },
  { type: 2, style: 2, custom_id: COMMAND.status, label: 'สถานะ bot', emoji: { name: '🧭' } },
  { type: 2, style: 2, custom_id: COMMAND.guide, label: 'คู่มือ', emoji: { name: '❓' } },
];
export const commandRows = () => rowsOf(COMMAND_BUTTONS);
/** @deprecated ใช้ commandRows() */
export const commandRow = () => ({ type: 1, components: COMMAND_BUTTONS });

/** Discord ตอบ interaction ได้ไม่เกิน 2000 ตัวอักษร */
export function clampReply(text: string, max = 1900): string {
  return text.length <= max ? text : text.slice(0, max) + '\n…(ตัดให้พอดีลิมิต)';
}

/**
 * จำนวนปุ่มต่อแถว · ค่าเริ่มต้น 5 = แถวเดียว
 * Discord กำหนดความกว้างปุ่มตามข้อความ ยืดเต็มแถวไม่ได้ → แยกแถวละ 2 แล้วขอบไม่ตรงกัน ดูแปลก (ลองแล้ว 18 ก.ย.)
 * อยากลอง 2×2 ตั้ง DISCORD_BUTTONS_PER_ROW=2 ใน .env
 */
export const buttonsPerRow = () => {
  const n = Number(process.env.DISCORD_BUTTONS_PER_ROW);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 5;
};
const rowsOf = <T,>(items: T[], per = buttonsPerRow()) => Array.from({ length: Math.ceil(items.length / per) }, (_, i) => ({ type: 1 as const, components: items.slice(i * per, i * per + per) }));

/** ปุ่มใต้ข้อความแจ้งเตือน · style 1=primary 2=secondary 4=danger 5=link */
export const NOTIFY_BUTTONS = [
  { type: 2, style: 1, custom_id: BUTTON.addNumber, label: 'กรอกเลขที่อยากจอง', emoji: { name: '🔢' } },
  { type: 2, style: 2, custom_id: BUTTON.showHistory, label: 'ดูประวัติแชต', emoji: { name: '📜' } },
  { type: 2, style: 4, custom_id: BUTTON.clearHistory, label: 'ลบประวัติแชตเก่า', emoji: { name: '🧹' } },
  { type: 2, style: 5, url: DLT_RESERVE_PAGE, label: 'เข้าสู่เว็บไซต์', emoji: { name: '🌐' } },
];
export const buttonRows = () => rowsOf(NOTIFY_BUTTONS);
/** @deprecated ใช้ buttonRows() — คงไว้ให้เทสเก่า */
export const buttonRow = () => ({ type: 1, components: NOTIFY_BUTTONS });

/** "5555, 6000 6464\n12345 abc" → valid [5555, 6000, 6464] · invalid ["12345", "abc"] (ไม่ซ้ำ รักษาลำดับ) */
export function parseNumbers(input: string): { valid: number[]; invalid: string[] } {
  const valid: number[] = []; const invalid: string[] = [];
  for (const tok of input.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean)) {
    const n = /^\d{1,4}$/.test(tok) ? Number(tok) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= 9999) { if (!valid.includes(n)) valid.push(n); }
    else invalid.push(tok);
  }
  return { valid, invalid };
}

async function readConfigRaw(configPath: string) {
  const raw = JSON.parse(await readFile(configPath, 'utf8'));
  raw.wishlist ??= {}; raw.wishlist.numbers ??= [];
  return raw as { wishlist: { numbers: number[] } };
}
const writeConfigRaw = (configPath: string, raw: unknown) => writeFile(configPath, JSON.stringify(raw, null, 2) + '\n');

export interface WishlistChange {
  added: number[]; already: number[]; removed: number[]; notFound: number[]; total: number;
}

/** เพิ่ม/ลบหลายเลขใน watch.config.json ในครั้งเดียว · ลบก่อนเพิ่ม (พิมพ์เลขเดียวกันทั้งสองช่อง = เพิ่ม) */
export async function updateWishlist(configPath: string, add: number[], remove: number[]): Promise<WishlistChange> {
  const raw = await readConfigRaw(configPath);
  let numbers = [...raw.wishlist.numbers];
  const removed = remove.filter((n) => numbers.includes(n));
  const notFound = remove.filter((n) => !numbers.includes(n));
  numbers = numbers.filter((n) => !removed.includes(n));
  const already = add.filter((n) => numbers.includes(n));
  const added = add.filter((n) => !numbers.includes(n));
  numbers = [...numbers, ...added].sort((a, b) => a - b);
  if (added.length || removed.length) { raw.wishlist.numbers = numbers; await writeConfigRaw(configPath, raw); }
  return { added, already, removed, notFound, total: numbers.length };
}

/** จำว่าใครเพิ่ม/ลบเลขไหน (ไว้บอกว่า "มี @คนนี้ เล็งไว้แล้ว") */
export async function updateOwners(statePath: string, user: string, added: number[], removed: number[]): Promise<Record<string, string>> {
  const state = await loadState(statePath);
  const owners = { ...(state.owners ?? {}) };
  const before = { ...owners };
  for (const n of removed) delete owners[n];
  for (const n of added) owners[n] ??= user;
  await saveState(statePath, { ...state, owners });
  return before;
}

/** เลขนี้เกี่ยวกับตารางสัปดาห์นี้ยังไง (สำหรับรถประเภทเดียวกับผู้ใช้) */
export function describeNumber(n: number, entries: ScheduleEntry[], today: string): string {
  const slot = entries.find((e) => n >= e.from && n <= e.to);
  if (!slot) return 'ยังไม่อยู่ในตารางสัปดาห์นี้ · จะแจ้งเมื่อถึงคิว';
  const d = daysBetween(today, slot.openDate);
  const where = `${slot.prefix} ${slot.from}–${slot.to}`;
  if (d < 0) return `⏪ ช่วง ${where} เปิดไปแล้วเมื่อ ${formatThaiDate(slot.openDate)} (น่าจะถูกจองแล้ว)`;
  if (d === 0) return `🔥 เปิดจอง**วันนี้** ${where} 10:00–16:00 น. รีบเลย`;
  return `⏳ จะเปิดจอง ${formatThaiDate(slot.openDate)} (${where}) อีก ${d} วัน`;
}

/** ข้อความสรุปผลของ modal — บรรทัดละเลข */
export function wishlistChangeText(c: WishlistChange, invalid: string[], owners: Record<string, string>, user: string, entries: ScheduleEntry[], today: string): string {
  const lines: string[] = [];
  for (const n of c.added) {
    const other = owners[n] && owners[n] !== user ? ` · 👤 ${owners[n]} เล็งไว้ก่อนแล้ว` : '';
    lines.push(`✅ **${n}** เพิ่มแล้ว · ${describeNumber(n, entries, today)}${other}`);
  }
  for (const n of c.already) lines.push(`ℹ️ **${n}** อยู่ใน wishlist อยู่แล้ว${owners[n] && owners[n] !== user ? ` (👤 ${owners[n]})` : ''}`);
  for (const n of c.removed) lines.push(`🗑️ **${n}** ลบออกจาก wishlist แล้ว`);
  for (const n of c.notFound) lines.push(`❔ **${n}** ไม่มีใน wishlist อยู่แล้ว`);
  for (const t of invalid) lines.push(`❌ "${t}" ไม่ใช่เลขทะเบียน 1–9999`);
  if (!lines.length) lines.push('ไม่มีอะไรเปลี่ยน');
  return `**wishlist ตอนนี้ ${c.total} เลข**\n${lines.join('\n')}\n-# การจองต้องทำเองผ่าน ThaID · bot เช็คกับระบบขนส่งไม่ได้ว่าเลขถูกจองไปแล้วหรือยัง`;
}

const shortDate = (iso: string) => formatThaiDate(iso, false);

/** แปลง key ใน state ให้คนอ่านรู้เรื่อง */
export function describeKey(key: string): string {
  const [kind, ...rest] = key.split(':');
  switch (kind) {
    case 'match': return `🎯 ${shortDate(rest[0])} · ${rest[1]} ${rest[2]}`;
    case 'open': return `⏰ เตือนก่อนเปิด ${rest[1]} (${shortDate(rest[0])})`;
    case 'deadline': return `⚠️ เตือนหมดเขตจด ${rest[1]} อีก ${rest[3]} วัน`;
    case 't10': return `🚦 ปิง 10 นาทีก่อนเปิด ${rest[1]} (${shortDate(rest[0])})`;
    case 'schedule': return `📅 ตารางรอบใหม่ (${rest.join(':')})`;
    case 'stale': return '🗓️ ตารางหมดอายุ';
    default: return key;
  }
}

export function formatHistory(state: State, limit = 15): string {
  if (!state.notified.length) return 'ยังไม่เคยแจ้งอะไรเลย';
  const recent = state.notified.slice(-limit).reverse();
  const more = state.notified.length > limit ? `\n…และก่อนหน้านี้อีก ${state.notified.length - limit} รายการ` : '';
  return `**แจ้งไปแล้ว ${state.notified.length} รายการ (ล่าสุดก่อน)**\n${recent.map(describeKey).join('\n')}${more}`;
}
