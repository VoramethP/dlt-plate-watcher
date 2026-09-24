// เลขที่ "จองได้แล้ว" — ผู้ใช้กดปุ่ม 🏆 บอกเอง (ADR-0008)
// bot ไม่มีทางรู้เองว่าใครจองอะไรได้ (ADR-0001) และกำหนดจดทะเบียนอยู่ได้นานกว่าตารางรายสัปดาห์
// จึงต้องเก็บเป็นข้อมูลของตัวเอง ไม่ใช่คำนวณจาก schedule.entries เหมือนเดิมที่ยิงไม่เคยออก
import { z } from 'zod';
import type { Store } from './store.js';
import { daysBetween, parseThaiDate } from './thai-date.js';

export const WonPlateSchema = z.object({
  /** หมวดอักษร เช่น "8ขช" */
  prefix: z.string().min(1),
  number: z.number().int().min(1).max(9999),
  /** วันสุดท้ายที่ต้องจดทะเบียน (ISO) — เลยกำหนดแล้วเลขหลุด */
  registerBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** ใครเป็นคนบันทึก (ชื่อโชว์ใน Discord) */
  by: z.string().default(''),
  at: z.string().default(''),
});
export type WonPlate = z.infer<typeof WonPlateSchema>;

export const WON_META_KEY = 'won';
export const plateText = (w: Pick<WonPlate, 'prefix' | 'number'>) => `${w.prefix} ${w.number}`;

/** meta เก็บเป็น JSON string — ใช้ได้ทั้ง fileStore และ Postgres โดยไม่ต้อง migration */
export function parseWon(raw?: string): WonPlate[] {
  if (!raw) return [];
  try {
    const parsed = z.array(WonPlateSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return []; // ข้อมูลเพี้ยนไม่ควรทำให้รอบ check ทั้งรอบล้ม — แค่ไม่เตือน
  }
}

export const loadWon = async (store: Store): Promise<WonPlate[]> => parseWon(await store.getMeta(WON_META_KEY));
export const saveWon = (store: Store, list: WonPlate[]) => store.setMeta(WON_META_KEY, JSON.stringify(list));

/**
 * รับวันที่ได้หลายแบบเท่าที่คนไทยพิมพ์จริง: 26/10/2569 · 26-10-2026 · 2026-10-26 · "26 ตุลาคม 2569"
 * ปี > 2400 ถือว่าเป็น พ.ศ. (เหมือน parseThaiDate) · คืน null ถ้าอ่านไม่ออก
 */
export function parseDeadline(text: string): string | null {
  const s = text.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return isoOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return isoOf(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return parseThaiDate(s);
}

function isoOf(year: number, month: number, day: number): string | null {
  const y = year > 2400 ? year - 543 : year; // พ.ศ. → ค.ศ.
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(y, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null; // 31 กุมภาพันธ์ ฯลฯ
  return d.toISOString().slice(0, 10);
}

export interface WonChange {
  added: WonPlate[];
  /** บันทึกไว้อยู่แล้ว (ทับด้วยของใหม่) */
  replaced: WonPlate[];
  removed: WonPlate[];
  notFound: number[];
  /** เลขที่หาหมวด/วันหมดเขตจากตารางไม่ได้ และผู้ใช้ไม่ได้พิมพ์มาเอง */
  needDate: number[];
  list: WonPlate[];
  changed: boolean;
}

export interface WonInput {
  numbers: number[];
  remove: number[];
  /** ผู้ใช้พิมพ์มาเอง (ว่าง = ให้หาจากตาราง) */
  prefix?: string;
  registerBy?: string;
  by: string;
  now: string;
  /** ช่วงเลขของตารางสัปดาห์นี้ (รถประเภทผู้ใช้) — ใช้เดาหมวด/วันหมดเขตให้ */
  entries: Array<{ prefix: string; from: number; to: number; registerBy: string }>;
}

/** แก้รายการ "จองได้แล้ว" ครั้งเดียวจบ (pure — คนเรียกเป็นคนเขียนลง store) */
export function applyWonChange(current: WonPlate[], input: WonInput): WonChange {
  let list = [...current];
  const removed: WonPlate[] = [];
  const notFound: number[] = [];
  for (const n of input.remove) {
    const hit = list.find((w) => w.number === n);
    if (hit) { removed.push(hit); list = list.filter((w) => w !== hit); } else notFound.push(n);
  }

  const added: WonPlate[] = []; const replaced: WonPlate[] = []; const needDate: number[] = [];
  for (const n of input.numbers) {
    const slot = input.entries.find((e) => n >= e.from && n <= e.to);
    const prefix = input.prefix || slot?.prefix;
    const registerBy = input.registerBy || slot?.registerBy;
    if (!prefix || !registerBy) { needDate.push(n); continue; } // ตารางสัปดาห์นี้ไม่ครอบเลขนี้ ต้องให้พิมพ์เอง
    const before = list.find((w) => w.number === n);
    if (before) { replaced.push(before); list = list.filter((w) => w !== before); }
    const plate: WonPlate = { prefix, number: n, registerBy, by: input.by, at: input.now };
    list.push(plate);
    added.push(plate);
  }

  list.sort((a, b) => a.registerBy.localeCompare(b.registerBy) || a.number - b.number);
  return { added, replaced, removed, notFound, needDate, list, changed: Boolean(added.length || removed.length) };
}

/** เลขที่ยังไม่ถึงกำหนด (เลยกำหนดแล้วไม่ต้องเตือน แต่ยังเก็บไว้ให้เห็น) */
export const pending = (list: WonPlate[], today: string) => list.filter((w) => daysBetween(today, w.registerBy) >= 0);

export const wonDeadlineKey = (w: WonPlate, daysLeft: number) => `won:${w.prefix}:${w.number}:${w.registerBy}:${daysLeft}`;
