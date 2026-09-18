import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseRowText, parseSchedulePdf } from '../src/schedule/parse.js';

describe('parseRowText', () => {
  it('อ่านแถวปกติ', () => {
    expect(parseRowText('จันทร์ 14 กันยายน 2569 8 ขจ 8001 - 9999 14 ตุลาคม 2569', 'car')).toEqual({
      vehicleType: 'car', openDate: '2026-09-14', prefix: '8ขจ', from: 8001, to: 9999, registerBy: '2026-10-14',
    });
  });
  it('เก็บหมายเหตุที่ต่อท้าย', () => {
    const e = parseRowText('พุธ 16 กันยายน 2569 1 นฎ 3001 - 3100 16 ตุลาคม 2569 1 นฎ -2621', 'van');
    expect(e?.note).toBe('1 นฎ -2621');
  });
  it('ไม่จับหัวตาราง', () => {
    expect(parseRowText('วัน วันที่ หมวดอักษร เลขเปิดจอง จดทะเบียนภายในวันที่ หมายเหตุ', 'car')).toBeNull();
  });
});

describe('parseSchedulePdf (fixture จริงจากขนส่ง รอบ 14-18 ก.ย. 2569)', () => {
  it('ได้ครบ 3 ประเภท × 5 วัน', async () => {
    const pdf = new Uint8Array(await readFile('tests/fixtures/schedule-2569-09-14.pdf'));
    const entries = await parseSchedulePdf(pdf);
    expect(entries).toHaveLength(15);
    expect(entries.filter((e) => e.vehicleType === 'car')).toHaveLength(5);
    expect(entries.filter((e) => e.vehicleType === 'van')).toHaveLength(5);
    expect(entries.filter((e) => e.vehicleType === 'pickup')).toHaveLength(5);

    const first = entries[0];
    expect(first).toMatchObject({ vehicleType: 'car', openDate: '2026-09-14', prefix: '8ขจ', from: 8001, to: 9999, registerBy: '2026-10-14' });

    const pickupFri = entries.find((e) => e.vehicleType === 'pickup' && e.openDate === '2026-09-18');
    expect(pickupFri).toMatchObject({ prefix: '4ฒฐ', from: 7401, to: 7600 });
  });
});
