// เลขที่กรมการขนส่งทางบก "กันไว้ประมูล" — เจอในตารางเปิดจอง แต่จองออนไลน์ไม่ได้ ต้องไปประมูล (ADR-0006)
// กฎอยู่ใน auction-rules.json สร้างจากตารางแนบท้ายประกาศฯ ด้วย npm run gen:auction — ไม่มีการถามระบบขนส่งตอนทำงาน (ADR-0001/0003)
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const GroupSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  /** กลุ่มราคาตามประกาศ (๑ แพงสุด) — ไว้บอกผู้ใช้ว่าเลขนี้อยู่ชั้นไหน */
  tier: z.number().int().default(3),
  numbers: z.array(z.number().int().min(1).max(9999)).default([]),
});
export const AuctionRulesSchema = z.object({
  total: z.number().int().default(0),
  vehicleTypes: z.array(z.string()).default([]),
  sources: z.array(z.object({ title: z.string(), published: z.string().optional(), url: z.string() }).passthrough()).default([]),
  groups: z.array(GroupSchema).default([]),
}).passthrough(); // ปล่อยให้มี key "_" สำหรับคำอธิบายในไฟล์

export type AuctionRules = z.infer<typeof AuctionRulesSchema>;
export const EMPTY_AUCTION: AuctionRules = { total: 0, vehicleTypes: [], sources: [], groups: [] };

/** ไม่มีไฟล์ = ไม่กรองอะไรเลย (ไม่ใช่ error) · ไฟล์เพี้ยน = โยน error ทันที ไม่กรองผิด ๆ เงียบ ๆ */
export async function loadAuctionRules(path = 'auction-rules.json'): Promise<AuctionRules> {
  let raw: string;
  try { raw = await readFile(path, 'utf8'); } catch { return EMPTY_AUCTION; }
  const parsed = AuctionRulesSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error(`${path} ไม่ถูกต้อง:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/** เลขที่ผู้ใช้เจอเองว่าจองไม่ได้ (ช่อง 🔨 ในปุ่ม 🔢) — ประกาศไม่ครอบคลุมทุกกรณี เช่น หมวดที่ขนส่งกันไว้เอง */
export const MANUAL_GROUP = 'เจอเองว่าจองไม่ได้';

/** เลข → ชื่อกลุ่มประมูล · ไม่มีในแมป = จองออนไลน์ได้ตามปกติ */
export type AuctionIndex = Map<number, string>;

export function auctionIndex(rules: AuctionRules = EMPTY_AUCTION, manual: number[] = []): AuctionIndex {
  const index: AuctionIndex = new Map();
  for (const g of rules.groups) for (const n of g.numbers) index.set(n, g.name);
  for (const n of manual) index.set(n, MANUAL_GROUP); // ของจริงที่ผู้ใช้เจอ ทับกฎเสมอ
  return index;
}

/** แยกเลขที่ตรงเงื่อนไขออกเป็น "จองออนไลน์ได้" กับ "ต้องประมูล" — ลำดับเดิมไม่เปลี่ยน */
export function splitAuction(numbers: number[], index: AuctionIndex) {
  const bookable: number[] = [];
  const auction: Array<{ n: number; group: string }> = [];
  for (const n of numbers) {
    const group = index.get(n);
    if (group) auction.push({ n, group });
    else bookable.push(n);
  }
  return { bookable, auction };
}
