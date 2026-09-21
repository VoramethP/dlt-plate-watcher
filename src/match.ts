// จับคู่ "เลขที่อยากได้" กับ "ช่วงเลขที่เปิดจองแต่ละวัน"
import { auctionIndex, type AuctionIndex } from './auction.js';
import type { Config } from './config.js';
import type { ScheduleEntry } from './schedule/types.js';

export interface Match {
  entry: ScheduleEntry;
  /** เลขในช่วงนั้นที่ตรงเงื่อนไข **และจองออนไลน์ได้** เรียงจากน้อยไปมาก */
  numbers: number[];
  /** ตรงเงื่อนไขเหมือนกัน แต่ขนส่งกันไว้ประมูล — แยกออกมาเพื่อไม่ให้ผู้ใช้เสียเวลารอ (ADR-0006) */
  auction: Array<{ n: number; group: string }>;
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

/** คืนเลขทั้งหมดใน [from, to] ที่ตรงเงื่อนไขอย่างน้อยหนึ่งข้อ · `auction` = แมปเลขประมูล (ไม่ส่งมา = ใช้เฉพาะที่ผู้ใช้ทำเครื่องหมายเอง) */
export function matchEntry(entry: ScheduleEntry, wishlist: Config['wishlist'], auction: AuctionIndex = auctionIndex(undefined, wishlist.auction ?? [])): Match | null {
  const wanted = new Set(wishlist.numbers);
  const patterns = wishlist.patterns.map((p) => ({ name: p.name, re: new RegExp(p.regex, 'u') }));
  const sums = new Set(wishlist.digitSums);
  const reasons = new Map<number, string[]>();
  const reasonOrder = [REASON_EXACT, ...patterns.map((p) => p.name), ...[...sums].sort((a, b) => a - b).map(reasonSum)];

  const excluded = new Set(wishlist.exclude ?? []);
  for (let n = entry.from; n <= entry.to; n++) {
    if (excluded.has(n)) continue; // ไม่อยากได้ → ไม่นับไม่ว่าจะตรงกฎไหน
    const why: string[] = [];
    if (wanted.has(n)) why.push(REASON_EXACT);
    const s = String(n);
    for (const p of patterns) if (p.re.test(s)) why.push(p.name);
    if (sums.has(digitSum(n))) why.push(reasonSum(digitSum(n)));
    if (why.length) reasons.set(n, why);
  }
  if (reasons.size === 0) return null;
  const all = [...reasons.keys()].sort((a, b) => a - b);
  // เลขประมูลยังอยู่ใน reasons (ผู้ใช้ควรรู้ว่าทำไมมันโผล่มา) แต่ไม่นับใน numbers
  const numbers = all.filter((n) => !auction.has(n));
  return { entry, numbers, auction: all.filter((n) => auction.has(n)).map((n) => ({ n, group: auction.get(n)! })), reasons, reasonOrder };
}

export function matchSchedule(entries: ScheduleEntry[], config: Config, auction?: AuctionIndex): Match[] {
  const index = auction ?? auctionIndex(undefined, config.wishlist.auction ?? []);
  return entries
    .filter((e) => e.vehicleType === config.vehicleType)
    .map((e) => matchEntry(e, config.wishlist, index))
    .filter((m): m is Match => m !== null);
}
