import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addNumberToConfig, buttonRow, describeKey, formatHistory } from '../src/notify/actions.js';

describe('buttonRow', () => {
  it('มี 4 ปุ่มตามที่ร่างไว้ และปุ่มสุดท้ายเป็นลิงก์ไปหน้าจองของขนส่ง', () => {
    const row = buttonRow();
    expect(row.components.map((c) => c.label)).toEqual(['กรอกเลขที่อยากจอง', 'ดูประวัติแชต', 'ลบประวัติแชตเก่า', 'เข้าสู่เว็บไซต์']);
    const link = row.components[3] as { style: number; url?: string };
    expect(link.style).toBe(5);
    expect(link.url).toContain('reserve.dlt.go.th');
  });
});

describe('addNumberToConfig', () => {
  async function tmpConfig() {
    const dir = await mkdtemp(join(tmpdir(), 'dlt-'));
    const path = join(dir, 'watch.config.json');
    await writeFile(path, JSON.stringify({ scheduleFileId: 'x', vehicleType: 'car', wishlist: { numbers: [9999], patterns: [], digitSums: [] } }, null, 2));
    return path;
  }
  it('เพิ่มเลขใหม่แบบเรียงลำดับ', async () => {
    const path = await tmpConfig();
    const r = await addNumberToConfig(path, ' 5555 ');
    expect(r).toEqual({ ok: true, number: 5555, already: false, total: 2 });
    expect(JSON.parse(await readFile(path, 'utf8')).wishlist.numbers).toEqual([5555, 9999]);
  });
  it('เลขซ้ำไม่เขียนไฟล์ซ้ำ', async () => {
    const path = await tmpConfig();
    const r = await addNumberToConfig(path, '9999');
    expect(r).toMatchObject({ ok: true, already: true, total: 1 });
  });
  it('ปฏิเสธค่าที่ไม่ใช่ 1–9999', async () => {
    const path = await tmpConfig();
    for (const bad of ['0', '10000', 'abc', '']) expect((await addNumberToConfig(path, bad)).ok).toBe(false);
  });
});

describe('ประวัติ', () => {
  it('แปลง key เป็นข้อความอ่านง่าย', () => {
    expect(describeKey('match:2026-09-18:8ขฉ:5001-6500:8fe91f12')).toBe('🎯 18 กันยายน 2569 · 8ขฉ 5001-6500');
    expect(describeKey('deadline:2026-09-14:8ขจ:8001:7')).toContain('อีก 7 วัน');
  });
  it('formatHistory เรียงล่าสุดก่อนและตัดที่ limit', () => {
    const keys = Array.from({ length: 20 }, (_, i) => `stale:F${i}`);
    const text = formatHistory({ notified: keys }, 5);
    expect(text).toContain('แจ้งไปแล้ว 20 รายการ');
    expect(text).toContain('อีก 15 รายการ');
    expect(formatHistory({ notified: [] })).toBe('ยังไม่เคยแจ้งอะไรเลย');
  });
});
