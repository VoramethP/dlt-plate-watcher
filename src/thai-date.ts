// วันที่บน PDF ของขนส่งเป็น พ.ศ. + ชื่อเดือนไทย เช่น "14 กันยายน 2569"
// เก็บเป็น ISO (ค.ศ.) ในระบบเสมอ แล้วค่อยแปลงกลับตอนแสดงผล

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
] as const;

export const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'] as const;

export const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'] as const;
export const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'] as const;

export const BANGKOK_TZ = 'Asia/Bangkok';

/** "14 กันยายน 2569" → "2026-09-14" · คืน null ถ้าอ่านไม่ออก */
export function parseThaiDate(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/u);
  if (!m) return null;
  const day = Number(m[1]);
  const monthIdx = THAI_MONTHS.indexOf(m[2] as (typeof THAI_MONTHS)[number]);
  const beYear = Number(m[3]);
  if (monthIdx < 0 || day < 1 || day > 31) return null;
  // ปีบน PDF เป็น พ.ศ. เสมอ แต่กันไว้เผื่อมีคนพิมพ์ ค.ศ. มา
  const year = beYear > 2400 ? beYear - 543 : beYear;
  const d = new Date(Date.UTC(year, monthIdx, day));
  if (d.getUTCMonth() !== monthIdx) return null; // เช่น 31 กุมภาพันธ์
  return d.toISOString().slice(0, 10);
}

/** "2026-09-14" → "จันทร์ 14 กันยายน 2569" */
export function formatThaiDate(iso: string, withDayName = true): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayName = THAI_DAYS[date.getUTCDay()];
  const text = `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
  return withDayName ? `${dayName} ${text}` : text;
}

/** "2026-09-14" → "จ. 14 ก.ย." (ไว้ใส่ในบรรทัดสั้น ๆ ของ embed) */
export function formatThaiDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${THAI_DAYS_SHORT[date.getUTCDay()]} ${d} ${THAI_MONTHS_SHORT[m - 1]}`;
}

/** วันนี้ตามเวลาไทย เป็น ISO date */
export function todayBangkok(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BANGKOK_TZ }).format(now);
}

/** เวลาปัจจุบันตามเวลาไทย เป็นนาทีนับจากเที่ยงคืน (ใช้เช็คช่วง 10:00-16:00) */
export function minutesOfDayBangkok(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BANGKOK_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const min = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + min;
}

/** จำนวนวันจาก a ไป b (ISO date ทั้งคู่) · บวก = b อยู่ในอนาคต */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
