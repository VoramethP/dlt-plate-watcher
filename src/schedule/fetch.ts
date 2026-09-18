// ดึง PDF ตารางเปิดจองจาก Google Drive
//
// ทำไมไม่ดึงจากเว็บขนส่งตรง ๆ: หน้า reserve.dlt.go.th อยู่หลัง WAF ที่ปฏิเสธทุก User-Agent
// ที่ไม่ใช่ browser (รวมถึงรูปแบบ bot สุภาพอย่าง "Mozilla/5.0 (compatible; ...)")
// เราเลือกไม่ปลอมตัวเป็น browser → ให้ผู้ใช้คัดลอก file id จาก iframe ในหน้าตารางมาใส่ config เอง
// ดู docs/adr/0003 · ตัวโปรแกรมจึงแตะแค่ Google Drive ไม่แตะเว็บขนส่งเลย

export const DLT_SCHEDULE_PAGE = 'https://reserve.dlt.go.th/reserve/v2/?menu=schedule';
export const DLT_RESERVE_PAGE = 'https://reserve.dlt.go.th/reserve/v2/?menu=resv_m';

export const USER_AGENT = 'dlt-plate-watcher/0.1 (+https://github.com/VoramethP/dlt-plate-watcher; notify-only)';

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * รับได้ทั้ง file id เปล่า ๆ, URL preview/view ของ Drive, หรือ HTML ทั้งก้อนที่ copy มาจากหน้าขนส่ง
 * (ตัดคอมเมนต์ก่อน เพราะหน้าขนส่งมี iframe เก่าที่คอมเมนต์ทิ้งไว้ — จะได้ id ผิดตัว)
 */
export function normalizeDriveFileId(input: string): string | null {
  const text = input.replace(/<!--[\s\S]*?-->/g, '').trim();
  const fromUrl = text.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^"'\s]*id=)([\w-]+)/);
  if (fromUrl) return fromUrl[1];
  return /^[\w-]{20,}$/.test(text) ? text : null;
}

export const driveDownloadUrl = (fileId: string) => `https://drive.google.com/uc?export=download&id=${fileId}`;

export interface SchedulePdf {
  bytes: Uint8Array;
  /** Last-Modified จาก Drive — ขนส่งอัปโหลดทับไฟล์เดิมทุกสัปดาห์ ค่านี้จึงเป็น "เวอร์ชัน" ของตาราง */
  lastModified: string | null;
}

export async function fetchSchedulePdf(fileId: string, fetcher: Fetcher = fetch): Promise<SchedulePdf> {
  const res = await fetcher(driveDownloadUrl(fileId), { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`โหลด PDF จาก Drive ไม่ได้ → HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Drive ตอบ HTML แทน PDF เมื่อไฟล์ถูกลบ/ปิดแชร์ — เช็ค magic bytes "%PDF"
  if (!isPdf(bytes)) throw new Error(`ไฟล์ ${fileId} จาก Drive ไม่ใช่ PDF — ไฟล์อาจถูกลบ ไปเอา id ใหม่ที่ ${DLT_SCHEDULE_PAGE}`);
  return { bytes, lastModified: res.headers.get('last-modified') };
}

export const isPdf = (buf: Uint8Array) => buf.length >= 4 && String.fromCharCode(...buf.slice(0, 4)) === '%PDF';
