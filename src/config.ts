import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { normalizeDriveFileId } from './schedule/fetch.js';

const VehicleTypeSchema = z.enum(['car', 'van', 'pickup']);

export const ConfigSchema = z.object({
  /** file id (หรือ URL) ของ PDF ตารางบน Google Drive — คัดลอกจาก iframe ในหน้า "ตารางเปิดจองหมายเลข" ของขนส่ง */
  scheduleFileId: z.string().transform((v, ctx) => {
    const id = normalizeDriveFileId(v);
    if (!id) ctx.addIssue({ code: 'custom', message: 'ไม่ใช่ Google Drive file id หรือ URL ที่รู้จัก' });
    return id ?? '';
  }),
  vehicleType: VehicleTypeSchema,
  wishlist: z.object({
    /** เลขที่อยากได้ตรง ๆ 1-9999 */
    numbers: z.array(z.number().int().min(1).max(9999)).default([]),
    /**
     * regex จับกับเลขแบบไม่เติมศูนย์ · ใส่ชื่อไทยด้วยจะได้อ่านใน Discord รู้เรื่อง
     * เช่น { "name": "เลขตอง", "regex": "^(\\d)\\1{2,3}$" } · ใส่เป็น string เฉย ๆ ก็ได้ (ชื่อ = regex)
     */
    patterns: z.array(
      z.union([z.string(), z.object({ name: z.string().min(1), regex: z.string().min(1) })])
        .transform((p) => (typeof p === 'string' ? { name: p, regex: p } : p)),
    ).default([]),
    /** ผลรวมเลขที่อยากได้ เช่น 9, 19, 24 */
    digitSums: z.array(z.number().int().min(1).max(36)).default([]),
    /** เลขที่ไม่อยากได้ — ตัดออกจากทุกเงื่อนไขข้างบน (เช่น จองได้แล้ว หรือ pattern จับได้แต่ไม่ชอบ) */
    exclude: z.array(z.number().int().min(1).max(9999)).default([]),
  }),
  reminders: z.object({
    daysBeforeOpen: z.array(z.number().int().min(0)).default([1]),
    daysBeforeRegisterDeadline: z.array(z.number().int().min(0)).default([7, 1]),
  }).default({ daysBeforeOpen: [1], daysBeforeRegisterDeadline: [7, 1] }),
});

export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(path = 'watch.config.json'): Promise<Config> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`ไม่พบ ${path} — คัดลอกจาก watch.config.example.json แล้วแก้ให้เป็นของคุณ`);
  }
  const parsed = ConfigSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`${path} ไม่ถูกต้อง:\n${z.prettifyError(parsed.error)}`);
  }
  // ตรวจ regex ตั้งแต่ตอนโหลด จะได้ไม่ไปพังกลางดึกตอน cron รัน
  for (const p of parsed.data.wishlist.patterns) new RegExp(p.regex, 'u');
  return parsed.data;
}
