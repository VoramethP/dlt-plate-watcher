// สร้าง auction-rules.json จาก "ตารางแนบท้าย" ของประกาศกรมการขนส่งทางบก (PDF บน tabienrod.com)
// รันมือเมื่อขนส่งแก้ประกาศ: npm run gen:auction  ·  ไม่ใช่โค้ดที่ bot เรียกตอนทำงาน (ADR-0003 คุมเฉพาะ runtime)
// เลขในไฟล์ผลลัพธ์มาจาก PDF ล้วน ๆ — สคริปต์แค่จัดกลุ่มตามรูปเลข แล้วตรวจว่าได้ครบ 301 ตามที่ประกาศระบุ
import { writeFile } from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';

const SOURCES = [
  {
    title: 'ประกาศกรมการขนส่งทางบก เรื่อง กำหนดหลักเกณฑ์ วิธีการ ระยะเวลา และเงื่อนไขการประมูลหมายเลขทะเบียนซึ่งเป็นที่ต้องการหรือเป็นที่นิยมของประชาชน สำหรับรถยนต์นั่งส่วนบุคคลไม่เกินเจ็ดคน พ.ศ. 2557 (ตารางแนบท้าย)',
    published: 'ราชกิจจานุเบกษา เล่ม 131 ตอนพิเศษ 185 ง หน้า 7 · 19 กันยายน 2557',
    url: 'http://tabienrod.com/filemanager/Uploads/announce2564/car1/Announcement_of_rules_and_regula.pdf',
    vehicleTypes: ['car'],
  },
  {
    title: 'ประกาศกรมการขนส่งทางบก เรื่อง กำหนดหลักเกณฑ์ฯ สำหรับรถยนต์นั่งส่วนบุคคลเกินเจ็ดคนแต่ไม่เกินสิบสองคน และรถยนต์บรรทุกส่วนบุคคล (ตารางแนบท้าย)',
    published: 'เผยแพร่บน tabienrod.com (เว็บไซต์กองทุนเพื่อความปลอดภัยในการใช้รถใช้ถนน กรมการขนส่งทางบก)',
    url: 'http://tabienrod.com/filemanager/Uploads/announce2564/car2%20car3/Announcement_of_Criteria_car2_3_.1.pdf',
    vehicleTypes: ['van', 'pickup'],
  },
] as const;

/** กลุ่มตามประกาศ (กลุ่ม ๑–๓) · ชื่อกลุ่มคัดจากตารางแนบท้ายตรง ๆ */
const GROUPS = [
  { id: 'four-same', name: 'เลขสี่ตัวเหมือน', tier: 1, test: (s: string) => s.length === 4 && new Set(s).size === 1 },
  { id: 'three-same', name: 'เลขสามตัวเหมือน', tier: 2, test: (s: string) => s.length === 3 && new Set(s).size === 1 },
  { id: 'two-same', name: 'เลขสองตัวเหมือน', tier: 2, test: (s: string) => s.length === 2 && s[0] === s[1] },
  { id: 'single', name: 'เลขตัวเดียว', tier: 2, test: (s: string) => s.length === 1 },
  { id: 'pair-89', name: 'เลขคู่ 8 เลขคู่ 9', tier: 2, test: (s: string) => s.length === 4 && new Set(s).size === 2 && [...s].every((c) => c === '8' || c === '9') },
  { id: 'thousand', name: 'เลขหลักพัน', tier: 3, test: (s: string) => /^[1-9]000$/.test(s) },
  { id: 'sequence', name: 'เลขเรียง', tier: 3, test: (s: string) => s.length >= 3 && [...s].every((c, i) => i === 0 || Number(c) - Number(s[i - 1]) === 1) },
  {
    id: 'pair', name: 'เลขคู่', tier: 3,
    // aabb / abba / abab ของเลขสองตัวใด ๆ (8-9 ถูกกลุ่ม "เลขคู่ 8 เลขคู่ 9" คว้าไปก่อนแล้ว)
    test: (s: string) => {
      const digits = [...new Set(s)];
      if (s.length !== 4 || digits.length !== 2) return false;
      const [a, b] = [s[0], digits.find((c) => c !== s[0])!];
      return [a + a + b + b, a + b + b + a, a + b + a + b].includes(s);
    },
  },
];

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const toArabic = (s: string) => [...s].map((c) => (THAI_DIGITS.includes(c) ? String(THAI_DIGITS.indexOf(c)) : c)).join('');

/** เอาเฉพาะช่วง "ตารางแนบท้าย" — ก่อนหน้านั้นเป็นตัวบทที่มีเลขข้อปนอยู่ */
function annexNumbers(text: string): number[] {
  const start = text.indexOf('กลุ่มหมายเลขทะเบียนซึ่งเป็นที่ต้องการ');
  const end = text.indexOf('อัตราหลักประกันการประมูล', start);
  if (start < 0 || end < 0) throw new Error('หา "ตารางแนบท้าย" ในประกาศไม่เจอ — รูปแบบ PDF เปลี่ยนไปแล้ว');
  const out = new Set<number>();
  for (const line of text.slice(start, end).split('\n')) {
    const clean = line.trim().replace(/^กลุ่ม\s*[๐-๙]+/, '').replace(/^-\s*[๐-๙]+\s*-$/, ''); // "กลุ่ม ๑" กับเลขหน้าไม่ใช่หมายเลขทะเบียน
    for (const tok of clean.match(/[๐-๙]+/g) ?? []) {
      const n = Number(toArabic(tok));
      if (n >= 1 && n <= 9999) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

async function numbersFrom(url: string): Promise<number[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้: HTTP ${res.status}`);
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(await res.arrayBuffer())), { mergePages: true });
  return annexNumbers(text);
}

const [car, others] = await Promise.all(SOURCES.map((s) => numbersFrom(s.url)));
const same = car.length === others.length && car.every((n, i) => n === others[i]);
if (!same) throw new Error('รถเก๋ง กับ รถตู้/กระบะ ใช้ชุดเลขไม่เหมือนกันแล้ว — ต้องแยกไฟล์ตามประเภทรถ');

// เลขหนึ่งอยู่กลุ่มเดียว — กลุ่มแรกที่เข้าเงื่อนไขชนะ (เรียงตามประกาศ กลุ่ม ๑ → ๓)
const groupOf = (n: number) => GROUPS.find((g) => g.test(String(n)));
const missing = car.filter((n) => !groupOf(n));
if (missing.length) throw new Error(`จัดกลุ่มไม่ได้: ${missing.join(', ')}`);
const groups = GROUPS.map((g) => ({ id: g.id, name: g.name, tier: g.tier, numbers: car.filter((n) => groupOf(n)!.id === g.id) }));
if (car.length !== 301) throw new Error(`ได้ ${car.length} เลข แต่ประกาศบอก 301 — อ่าน PDF ผิด`);

await writeFile('auction-rules.json', JSON.stringify({
  _: 'หมายเลขที่กรมการขนส่งทางบกกันไว้ประมูล (จองออนไลน์ไม่ได้) · สร้างจาก npm run gen:auction อย่าแก้มือ · เลขที่เจอเองเพิ่มได้ในช่อง 🔨 ของปุ่ม 🔢',
  total: car.length,
  vehicleTypes: ['car', 'van', 'pickup'],
  sources: SOURCES,
  groups,
}, null, 2) + '\n');
console.log(`เขียน auction-rules.json แล้ว: ${car.length} เลข · ${groups.map((g) => `${g.name} ${g.numbers.length}`).join(' · ')}`);
