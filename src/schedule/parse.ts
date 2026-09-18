// แปลง PDF ตารางเปิดจอง → ScheduleEntry[]
// วิธี: เอา text item ทุกชิ้นพร้อมพิกัด มาจัดกลุ่มเป็น "บรรทัด" ตามค่า y แล้วอ่านทีละบรรทัด
// ไม่พึ่ง pdftotext เพราะอยากให้รันได้ทุกที่ที่มี Node (รวมถึง GitHub Actions)

import { getDocumentProxy } from 'unpdf';
import { parseThaiDate } from '../thai-date.js';
import type { ScheduleEntry, VehicleType } from './types.js';

interface Cell { x: number; text: string }

const SECTION_HEADERS: Array<[RegExp, VehicleType]> = [
  [/ไม่เกิน\s*7\s*คน/u, 'car'],
  [/เกิน\s*7\s*คน/u, 'van'],
  [/บรรทุกส่วนบุคคล/u, 'pickup'],
];

/** อ่าน PDF เป็นบรรทัด ๆ (แต่ละบรรทัดเป็น cell เรียงซ้าย→ขวา) */
export async function pdfToLines(pdf: Uint8Array): Promise<Cell[][]> {
  const doc = await getDocumentProxy(pdf);
  const lines: Cell[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, Cell[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = item.transform[5];
      // ตัวอักษรไทยที่มีสระบน/ล่างอาจคลาดจากบรรทัดเดียวกันไม่กี่ px — รวมกลุ่มด้วยความคลาด 2
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key)!.push({ x: item.transform[4], text: item.str.trim() });
    }
    const pageLines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0]) // PDF นับ y จากล่างขึ้นบน
      .map(([, cells]) => cells.sort((a, b) => a.x - b.x));
    lines.push(...pageLines);
  }
  return lines;
}

/**
 * แถวข้อมูลหน้าตาแบบนี้ (หลังต่อ cell ด้วยช่องว่าง):
 *   "จันทร์ 14 กันยายน 2569 8 ขจ 8001 - 9999 14 ตุลาคม 2569 [หมายเหตุ...]"
 * หมวดอักษรถูกแยกเป็น "8" กับ "ขจ" เพราะ font ต่างกัน — จับด้วย regex ตัวเดียวแทนการนับ cell
 */
const ROW_RE =
  /^(\S+)\s+(\d{1,2}\s+\S+\s+\d{4})\s+(\d)\s*([ก-ฮ]{1,3})\s+(\d+)\s*-\s*(\d+)\s+(\d{1,2}\s+\S+\s+\d{4})\s*(.*)$/u;

export function parseRowText(text: string, vehicleType: VehicleType): ScheduleEntry | null {
  const m = text.match(ROW_RE);
  if (!m) return null;
  const openDate = parseThaiDate(m[2]);
  const registerBy = parseThaiDate(m[7]);
  if (!openDate || !registerBy) return null;
  const note = m[8].trim();
  return {
    vehicleType,
    openDate,
    prefix: `${m[3]}${m[4]}`,
    from: Number(m[5]),
    to: Number(m[6]),
    registerBy,
    ...(note ? { note } : {}),
  };
}

export function linesToEntries(lines: Cell[][]): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  let current: VehicleType | null = null;
  for (const cells of lines) {
    const text = cells.map((c) => c.text).join(' ');
    const header = SECTION_HEADERS.find(([re]) => re.test(text));
    if (header) { current = header[1]; continue; }
    if (!current) continue;
    const entry = parseRowText(text, current);
    if (entry) entries.push(entry);
  }
  return entries;
}

export async function parseSchedulePdf(pdf: Uint8Array): Promise<ScheduleEntry[]> {
  const entries = linesToEntries(await pdfToLines(pdf));
  if (entries.length === 0) throw new Error('อ่าน PDF ได้แต่ไม่พบแถวตารางเลย — รูปแบบตารางอาจเปลี่ยน');
  return entries;
}
