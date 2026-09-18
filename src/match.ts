// จับคู่ "เลขที่อยากได้" กับ "ช่วงเลขที่เปิดจองแต่ละวัน"
import type { Config } from './config.js';
import type { ScheduleEntry } from './schedule/types.js';

export interface Match {
  entry: ScheduleEntry;
  /** เลขในช่วงนั้นที่ตรงเงื่อนไข เรียงจากน้อยไปมาก */
  numbers: number[];
  /** เหตุผลต่อเลข เช่น "เลขที่ระบุไว้", ชื่อ pattern, "ผลรวม 9" */
  reasons: Map<number, string[]>;
  /** ลำดับเหตุผลตาม config (ใช้จัดกลุ่มตอนแสดงผล) */
  reasonOrder: string[];
}

export const REASON_EXACT = 'เลขที่ระบุไว้';
export const reasonSum = (n: number) => `ผลรวม ${n}`;

export function digitSum(n: number): number {
  return String(n).split('').reduce((s, d) => s + Number(d), 0);
}

/** คืนเลขทั้งหมดใน [from, to] ที่ตรงเงื่อนไขอย่างน้อยหนึ่งข้อ */
export function matchEntry(entry: ScheduleEntry, wishlist: Config['wishlist']): Match | null {
  const wanted = new Set(wishlist.numbers);
  const patterns = wishlist.patterns.map((p) => ({ name: p.name, re: new RegExp(p.regex, 'u') }));
  const sums = new Set(wishlist.digitSums);
  const reasons = new Map<number, string[]>();
  const reasonOrder = [REASON_EXACT, ...patterns.map((p) => p.name), ...[...sums].sort((a, b) => a - b).map(reasonSum)];

  for (let n = entry.from; n <= entry.to; n++) {
    const why: string[] = [];
    if (wanted.has(n)) why.push(REASON_EXACT);
    const s = String(n);
    for (const p of patterns) if (p.re.test(s)) why.push(p.name);
    if (sums.has(digitSum(n))) why.push(reasonSum(digitSum(n)));
    if (why.length) reasons.set(n, why);
  }
  if (reasons.size === 0) return null;
  return { entry, numbers: [...reasons.keys()].sort((a, b) => a - b), reasons, reasonOrder };
}

export function matchSchedule(entries: ScheduleEntry[], config: Config): Match[] {
  return entries
    .filter((e) => e.vehicleType === config.vehicleType)
    .map((e) => matchEntry(e, config.wishlist))
    .filter((m): m is Match => m !== null);
}
