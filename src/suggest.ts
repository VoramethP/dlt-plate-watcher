// คัดเลขน่าสนใจของวันนี้จากช่วงที่เปิดจอง — ใช้เฉพาะสิ่งที่นับได้จาก numerology.json (ห้ามแต่งเกณฑ์เอง)
// ตรรกะล้วน ไม่แตะ I/O · การ์ดประจำวันใน discord.ts เป็นคนเอาไปแสดง
import type { AuctionIndex } from './auction.js';
import { meaningOf, type Numerology, type NumerologyGroup } from './numerology.js';
import type { ScheduleEntry } from './schedule/types.js';

export interface Suggestion {
  n: number;
  score: number;
  sum: number;
  /** ดีมาก / ดี / ไม่ดีนัก — undefined = ผลรวมไม่อยู่ในตาราง */
  grade?: string;
  /** สายมงคลที่เข้า (ไม่รวมกลุ่มควรเลี่ยง เพราะเลขที่ติดกลุ่มนั้นถูกตัดไปแล้ว) */
  groups: Array<{ group: NumerologyGroup; via: string[]; votes: number }>;
}

/** เกรดผลรวมที่ตำราบอกว่าไม่ดี — เลขที่ได้เกรดนี้ไม่ขึ้นการ์ดเสนอ */
export const AVOID_GRADE = 'ไม่ดีนัก';

/**
 * คะแนน: สายมงคลที่เข้า ×2 + จำนวนแหล่งที่ตำราตรงกัน + ผลรวมเกรดดีมาก +2
 * ตัดทิ้งเลยถ้าตำราบอกให้เลี่ยง — ทั้งกลุ่มคู่เลข "ควรเลี่ยง" และผลรวมเกรด "ไม่ดีนัก"
 * (การ์ดนี้คือ "bot เสนอ" ไม่ใช่รายการทั้งหมด · ดูครบทุกเลขได้ที่ปุ่ม 🎯/📋)
 */
export function scoreNumber(prefix: string, n: number, table: Numerology): Suggestion | null {
  const m = meaningOf(prefix, n, table);
  if (m.groups.some((g) => g.group.kind === 'avoid')) return null;
  if (m.sumGrade?.grade === AVOID_GRADE) return null;
  const good = m.groups.filter((g) => g.group.kind !== 'avoid');
  if (!good.length) return null; // ไม่เข้าสายไหนเลย = ไม่มีเหตุผลจะเสนอ
  const votes = good.reduce((sum, g) => sum + g.votes, 0);
  const gradeBonus = m.sumGrade?.grade === 'ดีมาก' ? 2 : 0;
  return { n, score: good.length * 2 + votes + gradeBonus, sum: m.sum, grade: m.sumGrade?.grade, groups: good };
}

export interface SuggestOptions {
  /** เลขที่ไม่เอาเข้ารอบ: เลขประมูล (จองไม่ได้) */
  auction?: AuctionIndex;
  /** เลขที่ผู้ใช้ไม่อยากได้ + เลขที่อยู่ใน wishlist อยู่แล้ว (โชว์ในช่องของตัวเองแล้ว) */
  skip?: Iterable<number>;
  /** กี่เลขต่อสาย */
  perGroup?: number;
  numerology: Numerology;
}

export interface SuggestedGroup { group: NumerologyGroup; picks: Suggestion[] }
export interface SuggestResult {
  /** สายละไม่เกิน perGroup เลข · เลขหนึ่งโผล่สายเดียว (สายที่เรียงมาก่อนได้ไปก่อน) */
  groups: SuggestedGroup[];
  /** จำนวนเลขทั้งหมดที่ผ่านเกณฑ์ (ก่อนตัดเหลือสายละ 3) */
  eligible: number;
  /** จำนวนเลขในช่วงที่จองออนไลน์ได้ */
  bookable: number;
  /** จำนวนเลขในช่วงที่ขนส่งกันไว้ประมูล */
  auction: number;
}

/** ไล่ทั้งช่วงของวันนั้น (สูงสุด ~2,500 เลข) — เร็วพอสำหรับ serverless ไม่ต้อง cache */
export function suggestNumbers(entry: ScheduleEntry, opts: SuggestOptions): SuggestResult {
  const skip = new Set(opts.skip ?? []);
  const scored: Suggestion[] = [];
  let bookable = 0; let locked = 0;
  for (let n = entry.from; n <= entry.to; n++) {
    if (opts.auction?.has(n)) { locked++; continue; }
    bookable++;
    if (skip.has(n)) continue;
    const s = scoreNumber(entry.prefix, n, opts.numerology);
    if (s) scored.push(s);
  }
  // คะแนนมากก่อน · เท่ากันเอาเลขน้อยกว่า (คงที่ ทดสอบได้ ไม่สุ่ม)
  scored.sort((a, b) => b.score - a.score || a.n - b.n);
  const per = opts.perGroup ?? 3;
  const taken = new Set<number>();
  const groups: SuggestedGroup[] = [];
  for (const group of opts.numerology.groups) {
    if (group.kind === 'avoid') continue;
    const picks: Suggestion[] = [];
    for (const s of scored) {
      if (picks.length >= per) break;
      if (taken.has(s.n) || !s.groups.some((g) => g.group.name === group.name)) continue;
      picks.push(s); taken.add(s.n);
    }
    if (picks.length) groups.push({ group, picks });
  }
  return { groups, eligible: scored.length, bookable, auction: locked };
}
