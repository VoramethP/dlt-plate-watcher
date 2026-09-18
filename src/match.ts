// จับคู่ "เลขที่อยากได้" กับ "ช่วงเลขที่เปิดจองแต่ละวัน"
import type { Config } from './config.js';
import type { ScheduleEntry } from './schedule/types.js';

export interface Match {
  entry: ScheduleEntry;
  /** เลขในช่วงนั้นที่ตรงเงื่อนไข เรียงจากน้อยไปมาก */
  numbers: number[];
  /** เหตุผลต่อเลข เช่น "ตรง wishlist", "pattern ^(\d)\1{3}$", "ผลรวม 9" */
  reasons: Map<number, string[]>;
}

export function digitSum(n: number): number {
  return String(n).split('').reduce((s, d) => s + Number(d), 0);
}

/** คืนเลขทั้งหมดใน [from, to] ที่ตรงเงื่อนไขอย่างน้อยหนึ่งข้อ */
export function matchEntry(entry: ScheduleEntry, wishlist: Config['wishlist']): Match | null {
  const wanted = new Set(wishlist.numbers);
  const patterns = wishlist.patterns.map((p) => new RegExp(p, 'u'));
  const sums = new Set(wishlist.digitSums);
  const reasons = new Map<number, string[]>();

  for (let n = entry.from; n <= entry.to; n++) {
    const why: string[] = [];
    if (wanted.has(n)) why.push('ตรง wishlist');
    const s = String(n);
    for (const re of patterns) if (re.test(s)) why.push(`pattern ${re.source}`);
    if (sums.has(digitSum(n))) why.push(`ผลรวม ${digitSum(n)}`);
    if (why.length) reasons.set(n, why);
  }
  if (reasons.size === 0) return null;
  return { entry, numbers: [...reasons.keys()].sort((a, b) => a - b), reasons };
}

export function matchSchedule(entries: ScheduleEntry[], config: Config): Match[] {
  return entries
    .filter((e) => e.vehicleType === config.vehicleType)
    .map((e) => matchEntry(e, config.wishlist))
    .filter((m): m is Match => m !== null);
}
