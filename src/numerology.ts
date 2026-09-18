// เลขศาสตร์ — อ่านตารางจาก numerology.json (รวบรวมจากแหล่งสาธารณะ พร้อมบอกว่ารายการไหนมาจากแหล่งไหน)
// โค้ดไม่ตัดสินว่าดี/ร้าย แค่รายงานตามตาราง และบอกจำนวนแหล่งที่เห็นตรงกัน · ยังเป็นความเชื่อ ไม่ใช่ข้อเท็จจริง
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const GroupSchema = z.object({
  emoji: z.string().default('🔮'),
  name: z.string().min(1),
  /** 'avoid' = ตำราบอกว่าควรเลี่ยง → แสดงเป็นคำเตือน ไม่ใช่จุดขาย */
  kind: z.enum(['good', 'avoid']).default('good'),
  /** ผลรวมที่เข้ากลุ่ม (ทางเลือกสำหรับผู้ใช้ที่อยากผูกผลรวมกับกลุ่มเอง) */
  sums: z.array(z.number().int()).default([]),
  pairs: z.array(z.string().regex(/^\d\d$/)).default([]),
  /** คู่เลข → รายชื่อแหล่งที่บอกแบบนั้น */
  pairSources: z.record(z.string(), z.array(z.string())).default({}),
});
const SumGradeSchema = z.object({ grade: z.string(), sources: z.array(z.string()).default([]), meaning: z.string().optional(), conflict: z.record(z.string(), z.array(z.string())).optional() });
export const NumerologySchema = z.object({
  sources: z.array(z.object({ id: z.string(), name: z.string(), url: z.string() })).default([]),
  includePrefix: z.boolean().default(true),
  letterValues: z.record(z.string(), z.number().int()).default({}),
  sumGrades: z.record(z.string(), SumGradeSchema).default({}),
  groups: z.array(GroupSchema).default([]),
}).passthrough(); // ปล่อยให้มี key ที่ขึ้นต้น _ สำหรับคำอธิบายในไฟล์

export type Numerology = z.infer<typeof NumerologySchema>;
export type NumerologyGroup = z.infer<typeof GroupSchema>;

export const EMPTY_NUMEROLOGY: Numerology = { sources: [], includePrefix: true, letterValues: {}, sumGrades: {}, groups: [] };

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
  /** เกรดของผลรวมตามตาราง (ถ้ามี) */
  sumGrade?: { grade: string; sources: string[]; meaning?: string; conflict?: Record<string, string[]> };
  /** กลุ่มที่เข้า พร้อมเหตุผลและจำนวนแหล่งที่เห็นตรงกัน (มากสุดในบรรดาคู่ที่เข้า) */
  groups: Array<{ group: NumerologyGroup; via: string[]; votes: number }>;
}

export function meaningOf(prefix: string, number: number, table: Numerology): Meaning {
  const sum = plateSum(prefix, number, table);
  const pairs = adjacentPairs(number);
  const groups: Meaning['groups'] = [];
  for (const group of table.groups) {
    const via: string[] = []; let votes = 0;
    if (group.sums.includes(sum)) { via.push(`ผลรวม ${sum}`); votes = Math.max(votes, 1); }
    const hitPairs = [...new Set(pairs.filter((p) => group.pairs.includes(p)))];
    if (hitPairs.length) {
      via.push(`คู่เลข ${hitPairs.join(', ')}`);
      votes = Math.max(votes, ...hitPairs.map((p) => group.pairSources[p]?.length ?? 1));
    }
    if (via.length) groups.push({ group, via, votes });
  }
  const g = table.sumGrades[String(sum)];
  return { sum, sumGrade: g ? { grade: g.grade, sources: g.sources, meaning: g.meaning, conflict: g.conflict } : undefined, groups };
}

const srcCount = (n: number) => (n > 1 ? ` · ${n} แหล่งตรงกัน` : n === 1 ? ' · 1 แหล่ง' : '');

/** บรรทัดสั้น ๆ: "💗 เมตตามหานิยม (คู่เลข 24 · 3 แหล่งตรงกัน) · ผลรวม 35 ไม่อยู่ในตาราง" หรือ '' ถ้าไม่มีอะไรจะบอก */
export function meaningLine(prefix: string, number: number, table: Numerology): string {
  if (!table.groups.length && !Object.keys(table.sumGrades).length) return '';
  const m = meaningOf(prefix, number, table);
  const parts = m.groups.map((g) => `${g.group.emoji} ${g.group.name} (${g.via.join(' · ')}${srcCount(g.votes)})`);
  if (m.sumGrade) parts.push(`ผลรวม ${m.sum} = ${m.sumGrade.grade}${m.sumGrade.meaning ? ` · ${m.sumGrade.meaning}` : ''}${srcCount(m.sumGrade.sources.length)}${m.sumGrade.conflict ? ' · บางแหล่งเห็นต่าง' : ''}`);
  else parts.push(`ผลรวม ${m.sum} ไม่อยู่ในตาราง`);
  return parts.join(' / ');
}

/** จัดกลุ่มเลขตามกลุ่ม สำหรับ field "🔮 ความหมาย" ในการ์ด · กลุ่ม avoid ไปท้ายสุด */
export function groupNumbersByMeaning(prefix: string, numbers: number[], table: Numerology): Array<{ group: NumerologyGroup; numbers: number[] }> {
  const out = new Map<string, { group: NumerologyGroup; numbers: number[] }>();
  for (const n of numbers) {
    for (const { group } of meaningOf(prefix, n, table).groups) {
      const slot = out.get(group.name) ?? { group, numbers: [] };
      slot.numbers.push(n);
      out.set(group.name, slot);
    }
  }
  return [...out.values()].sort((a, b) => Number(a.group.kind === 'avoid') - Number(b.group.kind === 'avoid'));
}

/** เลขที่ผลรวมได้เกรด "ดีมาก" ตามตาราง — ไว้ทำกลุ่มพิเศษในการ์ด */
export function bestSumNumbers(prefix: string, numbers: number[], table: Numerology): Array<{ n: number; sum: number }> {
  return numbers.map((n) => ({ n, sum: plateSum(prefix, n, table) })).filter(({ sum }) => table.sumGrades[String(sum)]?.grade === 'ดีมาก');
}
