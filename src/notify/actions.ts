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
  showWishlist: 'show_wishlist',
  share: 'share_text',
  showHistory: 'show_history',
  clearHistory: 'clear_history',
} as const;
export const MODAL = { addNumber: 'add_number_modal', field: 'number', removeField: 'remove', excludeField: 'exclude' } as const;

/** ข้อความใน modal — Discord จำกัด title/label ≤ 45 ตัวอักษร · placeholder ≤ 100 (เกินแล้ว discord.js โยน "Invalid string length" ก่อนส่ง → ปุ่มขึ้น "ไม่ตอบสนอง") */
export const MODAL_TEXT = {
  title: 'เลขที่อยากได้ (เฝ้าให้ ไม่ได้จองแทน)',
  addLabel: 'เพิ่มเลข 1–9999 (คั่นด้วย , หรือเว้นวรรค)',
  addPlaceholder: 'เช่น 5555, 6000 6464',
  removeLabel: 'ลบออกจากรายการ (ไม่ใส่ก็ได้)',
  removePlaceholder: 'เช่น 15 · ลบได้ทั้งเลขที่อยากได้และไม่อยากได้',
  excludeLabel: 'ไม่อยากได้ — ตัดออกจากทุกรูปแบบ (ไม่ใส่ก็ได้)',
  excludePlaceholder: 'เช่น 4444 หรือเลขที่จองได้แล้ว',
} as const;
export const DISCORD_LIMITS = { modalTitle: 45, inputLabel: 45, placeholder: 100 } as const;

/** ปุ่มลัดของคำสั่ง CLI — อยู่บน "แผงควบคุม" ที่ bot โพสต์ตอนเริ่ม watch */
export const COMMAND = { schedule: 'cmd_schedule', match: 'cmd_match', check: 'cmd_check', status: 'cmd_status', guide: 'cmd_guide' } as const;
export type CommandId = (typeof COMMAND)[keyof typeof COMMAND];



/** แปลง embed ของข้อความที่กดปุ่มเป็นข้อความล้วน ไว้ใส่ code block ให้คัดลอกไปคุยกับคนอื่น */
export function embedToText(e: { title?: string | null; description?: string | null; fields?: Array<{ name: string; value: string }> }): string {
  const plain = (s: string) => s.replace(/\*\*/g, '').replace(/`/g, '').replace(/^-# .*$/gm, '').replace(/\n{2,}/g, '\n').trim();
  const lines: string[] = [];
  if (e.title) lines.push(plain(e.title));
  if (e.description) lines.push(plain(e.description));
  for (const f of e.fields ?? []) {
    const value = plain(f.value);
    lines.push(value.includes('\n') ? `${plain(f.name)}:\n${value}` : `${plain(f.name)}: ${value}`);
  }
  return lines.join('\n');
}

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

/** ปุ่มทั้งหมด — style 1=primary 2=secondary 4=danger 5=link */
export const BTN = {
  addNumber: { type: 2, style: 1, custom_id: BUTTON.addNumber, label: 'กรอกเลขที่อยากจอง', emoji: { name: '🔢' } },
  wishlist: { type: 2, style: 2, custom_id: BUTTON.showWishlist, label: 'เลขที่เฝ้าอยู่', emoji: { name: '📋' } },
  share: { type: 2, style: 2, custom_id: BUTTON.share, label: 'แชร์เลข', emoji: { name: '📤' } },
  clear: { type: 2, style: 4, custom_id: BUTTON.clearHistory, label: 'ลบประวัติแชตเก่า', emoji: { name: '🧹' } },
  web: { type: 2, style: 5, url: DLT_RESERVE_PAGE, label: 'เข้าสู่เว็บไซต์', emoji: { name: '🌐' } },
  schedule: { type: 2, style: 2, custom_id: COMMAND.schedule, label: 'ตาราง', emoji: { name: '📅' } },
  match: { type: 2, style: 2, custom_id: COMMAND.match, label: 'เลขในฝัน', emoji: { name: '🎯' } },
  check: { type: 2, style: 2, custom_id: COMMAND.check, label: 'เช็คตอนนี้', emoji: { name: '🔄' } },
  history: { type: 2, style: 2, custom_id: BUTTON.showHistory, label: 'ประวัติ', emoji: { name: '📜' } },
  guide: { type: 2, style: 2, custom_id: COMMAND.guide, label: 'คู่มือ', emoji: { name: '❓' } },
} as const;

/** ใต้การ์ดแจ้งเตือน: เหลือแค่ปุ่มที่เกี่ยวกับการ์ดนั้น (ทำอย่างอื่นไปที่ landing panel ล่างสุด) */
export const NOTIFY_BUTTONS = [BTN.share, BTN.web];
export const buttonRows = () => rowsOf(NOTIFY_BUTTONS);
export const shareRow = () => ({ type: 1 as const, components: [BTN.share] });

/** landing panel: แถว "ทำ" + แถว "ดู" */
export const PANEL_ACTION_BUTTONS = [BTN.addNumber, BTN.wishlist, BTN.clear, BTN.web];
export const PANEL_VIEW_BUTTONS = [BTN.schedule, BTN.match, BTN.check, BTN.history, BTN.guide];
export const panelRows = () => [...rowsOf(PANEL_ACTION_BUTTONS), ...rowsOf(PANEL_VIEW_BUTTONS)];
/** @deprecated ชื่อเก่า — ตอนนี้แผงคือ panelRows() */
export const commandRows = panelRows;

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
  raw.wishlist ??= {}; raw.wishlist.numbers ??= []; raw.wishlist.exclude ??= [];
  return raw as { wishlist: { numbers: number[]; exclude: number[] } };
}
const writeConfigRaw = (configPath: string, raw: unknown) => writeFile(configPath, JSON.stringify(raw, null, 2) + '\n');

export interface WishlistChange {
  added: number[]; already: number[]; removed: number[]; notFound: number[]; total: number;
  /** รายการหลังแก้ (เรียงแล้ว) */
  numbers: number[];
  /** ผลของช่อง "ไม่อยากได้" */
  excluded: number[]; alreadyExcluded: number[]; unexcluded: number[];
  exclude: number[];
}

/**
 * แก้ wishlist ครั้งเดียวจบ ลำดับ: ลบ (ออกจากทั้งสองรายการ) → ไม่อยากได้ (ย้ายออกจากอยากได้) → เพิ่ม (ย้ายออกจากไม่อยากได้)
 * ใส่เลขเดียวกันหลายช่อง = ช่องเพิ่มชนะ
 */
export async function updateWishlist(configPath: string, add: number[], remove: number[], exclude: number[] = []): Promise<WishlistChange> {
  const raw = await readConfigRaw(configPath);
  let numbers = [...raw.wishlist.numbers];
  let ex = [...raw.wishlist.exclude];
  const removed = remove.filter((n) => numbers.includes(n) || ex.includes(n));
  const notFound = remove.filter((n) => !removed.includes(n));
  numbers = numbers.filter((n) => !removed.includes(n));
  ex = ex.filter((n) => !removed.includes(n));

  const alreadyExcluded = exclude.filter((n) => ex.includes(n));
  const excluded = exclude.filter((n) => !ex.includes(n));
  ex = [...ex, ...excluded];
  numbers = numbers.filter((n) => !exclude.includes(n));

  const already = add.filter((n) => numbers.includes(n));
  const added = add.filter((n) => !numbers.includes(n));
  const unexcluded = add.filter((n) => ex.includes(n));
  ex = ex.filter((n) => !add.includes(n)).sort((a, b) => a - b);
  numbers = [...numbers, ...added].sort((a, b) => a - b);

  const changed = added.length || removed.length || excluded.length || unexcluded.length ||
    exclude.some((n) => raw.wishlist.numbers.includes(n));
  if (changed) { raw.wishlist.numbers = numbers; raw.wishlist.exclude = ex; await writeConfigRaw(configPath, raw); }
  return { added, already, removed, notFound, total: numbers.length, numbers, excluded, alreadyExcluded, unexcluded, exclude: ex };
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

/** อ่าน pattern/digitSums จาก config ตรง ๆ (ไม่ผ่าน zod เพื่อไม่ผูก actions กับ config.ts) */
export async function readPatternRules(configPath: string): Promise<{ patterns: Array<{ name: string; regex: string }>; digitSums: number[] }> {
  const raw = JSON.parse(await readFile(configPath, 'utf8'));
  const patterns = (raw.wishlist?.patterns ?? []).map((p: string | { name: string; regex: string }) => (typeof p === 'string' ? { name: p, regex: p } : p));
  return { patterns, digitSums: raw.wishlist?.digitSums ?? [] };
}

/** เลขนี้ถูกเฝ้าอยู่แล้วผ่าน pattern/ผลรวมไหม → คืนชื่อกฎที่ครอบ (ว่าง = ไม่ครอบ) */
export function coveredBy(n: number, rules: { patterns: Array<{ name: string; regex: string }>; digitSums: number[] }): string[] {
  const hits = rules.patterns.filter((p) => { try { return new RegExp(p.regex, 'u').test(String(n)); } catch { return false; } }).map((p) => p.name);
  const sum = String(n).split('').reduce((s, d) => s + Number(d), 0);
  if (rules.digitSums.includes(sum)) hits.push(`ผลรวม ${sum}`);
  return hits;
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
export function wishlistChangeText(c: WishlistChange, invalid: string[], owners: Record<string, string>, user: string, entries: ScheduleEntry[], today: string, rules = { patterns: [] as Array<{ name: string; regex: string }>, digitSums: [] as number[] }, meanings: Record<number, string> = {}): string {
  const lines: string[] = [];
  for (const n of c.added) {
    const other = owners[n] && owners[n] !== user ? ` · 👤 ${owners[n]} เล็งไว้ก่อนแล้ว` : '';
    const covered = coveredBy(n, rules);
    // เตือนแต่ยังเพิ่มให้ — ระบุตรง ๆ มีประโยชน์ตอนลบ pattern ทีหลัง
    const dup = covered.length ? `\n   ↳ 💡 เลขนี้ถูกเฝ้าอยู่แล้วผ่านรูปแบบ "${covered.join('", "')}" ไม่ใส่ก็แจ้งเตือนอยู่ดี` : '';
    const mean = meanings[n] ? `\n   ↳ 🔮 ${meanings[n]}` : '';
    lines.push(`✅ **${n}** เพิ่มแล้ว · ${describeNumber(n, entries, today)}${other}${dup}${mean}`);
  }
  for (const n of c.already) lines.push(`ℹ️ **${n}** อยู่ใน wishlist อยู่แล้ว${owners[n] && owners[n] !== user ? ` (👤 ${owners[n]})` : ''}`);
  for (const n of c.unexcluded) lines.push(`♻️ **${n}** เอาออกจากรายการไม่อยากได้แล้ว (กลับมาเฝ้า)`);
  for (const n of c.excluded) lines.push(`🚫 **${n}** ใส่รายการไม่อยากได้แล้ว · จะไม่แจ้งเลขนี้ไม่ว่าตรงรูปแบบไหน`);
  for (const n of c.alreadyExcluded) lines.push(`ℹ️ **${n}** อยู่ในรายการไม่อยากได้อยู่แล้ว`);
  for (const n of c.removed) lines.push(`🗑️ **${n}** ลบออกจากรายการแล้ว`);
  for (const n of c.notFound) lines.push(`❔ **${n}** ไม่มีในรายการไหนอยู่แล้ว`);
  for (const t of invalid) lines.push(`❌ "${t}" ไม่ใช่เลขทะเบียน 1–9999`);
  if (!lines.length) lines.push('ไม่มีอะไรเปลี่ยน');
  const current = c.numbers.length ? c.numbers.map((n) => `\`${n}\``).join(' ') : '(ว่าง)';
  const ex = c.exclude.length ? `\n**🚫 ไม่อยากได้ (${c.exclude.length}):** ${c.exclude.map((n) => `\`${n}\``).join(' ')}` : '';
  return `${lines.join('\n')}\n\n**📋 เลขที่เฝ้าอยู่ตอนนี้ (${c.total}):** ${current}${ex}\n-# กรอกผิด → กด 🔢 อีกครั้งแล้วใส่เลขในช่องลบ · การจองต้องทำเองผ่าน ThaID`;
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
