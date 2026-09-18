// เลขศาสตร์ — อ่านตารางจาก numerology.json (แก้ได้เอง ไม่ต้องรีสตาร์ต)
// ค่าเริ่มต้นเป็นความเชื่อทั่วไป โค้ดไม่ตัดสินว่าดี/ร้าย แค่บอกว่าเลขนี้เข้า "สาย" ไหนตามตารางของผู้ใช้
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const GroupSchema = z.object({
  emoji: z.string().default('🔮'),
  name: z.string().min(1),
  sums: z.array(z.number().int()).default([]),
  pairs: z.array(z.string().regex(/^\d\d$/)).default([]),
});
export const NumerologySchema = z.object({
  includePrefix: z.boolean().default(true),
  letterValues: z.record(z.string(), z.number().int()).default({}),
  groups: z.array(GroupSchema).default([]),
}).passthrough(); // ปล่อยให้มี key ที่ขึ้นต้น _ สำหรับคำอธิบายในไฟล์

export type Numerology = z.infer<typeof NumerologySchema>;
export type NumerologyGroup = z.infer<typeof GroupSchema>;

export const EMPTY_NUMEROLOGY: Numerology = { includePrefix: true, letterValues: {}, groups: [] };

/** ไม่มีไฟล์ = ไม่แสดงความหมาย (ไม่ใช่ error) · ไฟล์เพี้ยน = โยน error บอกบรรทัด */
export async function loadNumerology(path = 'numerology.json'): Promise<Numerology> {
  let raw: string;
  try { raw = await readFile(path, 'utf8'); } catch { return EMPTY_NUMEROLOGY; }
  const parsed = NumerologySchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error(`${path} ไม่ถูกต้อง:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/** ผลรวมของป้าย: เลขนำหมวด + ค่าตัวอักษร (ถ้า includePrefix) + เลข 4 หลัก */
export function plateSum(prefix: string, number: number, table: Numerology): number {
  const digits = (s: string) => s.split('').filter((c) => /\d/.test(c)).reduce((a, c) => a + Number(c), 0);
  let sum = digits(String(number));
  if (table.includePrefix) {
    sum += digits(prefix);
    for (const ch of prefix) if (table.letterValues[ch] !== undefined) sum += table.letterValues[ch];
  }
  return sum;
}

/** คู่เลขที่ติดกัน: 2456 → ["24", "45", "56"] */
export function adjacentPairs(number: number): string[] {
  const s = String(number);
  return Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2));
}

export interface Meaning {
  sum: number;
  /** สายที่เข้า พร้อมเหตุผล (ผลรวม / คู่เลข) เรียงตามลำดับในไฟล์ */
  groups: Array<{ group: NumerologyGroup; via: string[] }>;
}

export function meaningOf(prefix: string, number: number, table: Numerology): Meaning {
  const sum = plateSum(prefix, number, table);
  const pairs = adjacentPairs(number);
  const groups: Meaning['groups'] = [];
  for (const group of table.groups) {
    const via: string[] = [];
    if (group.sums.includes(sum)) via.push(`ผลรวม ${sum}`);
    const hitPairs = pairs.filter((p) => group.pairs.includes(p));
    if (hitPairs.length) via.push(`คู่เลข ${[...new Set(hitPairs)].join(', ')}`);
    if (via.length) groups.push({ group, via });
  }
  return { sum, groups };
}

/** "💰 สายการเงิน… (ผลรวม 35)" หรือ '' ถ้าไม่เข้าสายไหน */
export function meaningLine(prefix: string, number: number, table: Numerology): string {
  const m = meaningOf(prefix, number, table);
  if (!m.groups.length) return '';
  return m.groups.map((g) => `${g.group.emoji} ${g.group.name} (${g.via.join(' · ')})`).join(' / ');
}

/** จัดกลุ่มเลขตามสาย สำหรับ field "🔮 ความหมาย" ในการ์ด */
export function groupNumbersByMeaning(prefix: string, numbers: number[], table: Numerology): Array<{ group: NumerologyGroup; numbers: number[] }> {
  const out = new Map<string, { group: NumerologyGroup; numbers: number[] }>();
  for (const n of numbers) {
    for (const { group } of meaningOf(prefix, n, table).groups) {
      const slot = out.get(group.name) ?? { group, numbers: [] };
      slot.numbers.push(n);
      out.set(group.name, slot);
    }
  }
  return [...out.values()];
}
