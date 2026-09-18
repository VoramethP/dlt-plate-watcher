// ตรรกะของปุ่มใต้ข้อความ — pure ไม่แตะ discord.js เพื่อให้เทสได้
// ปุ่ม "กรอกเลขที่อยากจอง" แค่เพิ่มเลขลง wishlist ให้เฝ้า ไม่ได้จองแทน (ADR-0001)
import { readFile, writeFile } from 'node:fs/promises';
import { DLT_RESERVE_PAGE } from '../schedule/fetch.js';
import type { State } from '../state.js';
import { formatThaiDate } from '../thai-date.js';

export const BUTTON = {
  addNumber: 'add_number',
  showHistory: 'show_history',
  clearHistory: 'clear_history',
} as const;
export const MODAL = { addNumber: 'add_number_modal', field: 'number' } as const;

/** action row แบบ JSON ดิบ (discord.js รับได้ตรง ๆ) · style 1=primary 2=secondary 4=danger 5=link */
export function buttonRow() {
  return {
    type: 1,
    components: [
      { type: 2, style: 1, custom_id: BUTTON.addNumber, label: 'กรอกเลขที่อยากจอง', emoji: { name: '🔢' } },
      { type: 2, style: 2, custom_id: BUTTON.showHistory, label: 'ดูประวัติแชต', emoji: { name: '📜' } },
      { type: 2, style: 4, custom_id: BUTTON.clearHistory, label: 'ลบประวัติแชตเก่า', emoji: { name: '🧹' } },
      { type: 2, style: 5, url: DLT_RESERVE_PAGE, label: 'เข้าสู่เว็บไซต์', emoji: { name: '🌐' } },
    ],
  };
}

export type AddNumberResult =
  | { ok: true; number: number; already: boolean; total: number }
  | { ok: false; error: string };

/** รับข้อความจาก modal → เพิ่มลง wishlist.numbers ใน watch.config.json (เขียนทับไฟล์แบบ 2-space) */
export async function addNumberToConfig(configPath: string, input: string): Promise<AddNumberResult> {
  const text = input.trim().replace(/[^\d]/g, '');
  const number = Number(text);
  if (!text || !Number.isInteger(number) || number < 1 || number > 9999) {
    return { ok: false, error: `"${input.trim()}" ไม่ใช่เลขทะเบียน 1–9999` };
  }
  const raw = JSON.parse(await readFile(configPath, 'utf8'));
  raw.wishlist ??= {};
  raw.wishlist.numbers ??= [];
  const already = raw.wishlist.numbers.includes(number);
  if (!already) {
    raw.wishlist.numbers = [...raw.wishlist.numbers, number].sort((a: number, b: number) => a - b);
    await writeFile(configPath, JSON.stringify(raw, null, 2) + '\n');
  }
  return { ok: true, number, already, total: raw.wishlist.numbers.length };
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
