import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buttonRow, buttonRows, clampReply, commandRow, commandRows, describeKey, describeNumber, formatHistory, parseNumbers, updateOwners, updateWishlist, wishlistChangeText } from '../src/notify/actions.js';
import { loadState } from '../src/state.js';

describe('buttonRow', () => {
  it('มี 4 ปุ่มตามที่ร่างไว้ และปุ่มสุดท้ายเป็นลิงก์ไปหน้าจองของขนส่ง', () => {
    const row = buttonRow();
    expect(row.components.map((c) => c.label)).toEqual(['กรอกเลขที่อยากจอง', 'ดูประวัติแชต', 'ลบประวัติแชตเก่า', 'เข้าสู่เว็บไซต์']);
    const link = row.components[3] as { style: number; url?: string };
    expect(link.style).toBe(5);
    expect(link.url).toContain('reserve.dlt.go.th');
  });
});

describe('จัดปุ่ม 2 แถว × 2', () => {
  it('ปุ่มแจ้งเตือน 4 ปุ่ม → 2 ActionRow แถวละ 2', () => {
    const rows = buttonRows();
    expect(rows.map((r) => r.components.length)).toEqual([2, 2]);
    expect(rows.every((r) => r.type === 1)).toBe(true);
  });
  it('ปุ่มแผง 5 ปุ่ม → 2, 2, 1 (ไม่เกิน 5 แถว)', () => {
    expect(commandRows().map((r) => r.components.length)).toEqual([2, 2, 1]);
  });
});

describe('commandRow', () => {
  it('ปุ่มลัด 4 คำสั่ง custom_id ขึ้นต้น cmd_ ทั้งหมด', () => {
    const row = commandRow();
    expect(row.components.map((c) => c.label)).toEqual(['ตารางสัปดาห์นี้', 'เลขในฝันรอบนี้', 'เช็คตอนนี้', 'สถานะ bot', 'คู่มือ']);
    expect(row.components.length).toBeLessThanOrEqual(5); // ลิมิตต่อแถวของ Discord
    expect(row.components.every((c) => 'custom_id' in c && c.custom_id.startsWith('cmd_'))).toBe(true);
  });
  it('clampReply ตัดให้ไม่เกินลิมิต Discord', () => {
    expect(clampReply('x'.repeat(3000)).length).toBeLessThanOrEqual(2000);
    expect(clampReply('สั้น')).toBe('สั้น');
  });
});

async function tmpConfig() {
  const dir = await mkdtemp(join(tmpdir(), 'dlt-'));
  const path = join(dir, 'watch.config.json');
  await writeFile(path, JSON.stringify({ scheduleFileId: 'x', vehicleType: 'car', wishlist: { numbers: [9999], patterns: [], digitSums: [] } }, null, 2));
  return { path, dir };
}

describe('parseNumbers', () => {
  it('รับหลายตัวคั่นด้วย , เว้นวรรค ขึ้นบรรทัด และคัดตัวที่ไม่ใช่เลขทะเบียน', () => {
    expect(parseNumbers('5555, 6000 6464\n15;5555 12345 abc 0')).toEqual({ valid: [5555, 6000, 6464, 15], invalid: ['12345', 'abc', '0'] });
    expect(parseNumbers('')).toEqual({ valid: [], invalid: [] });
  });
});

describe('updateWishlist', () => {
  it('เพิ่มหลายเลข เรียงลำดับ และรายงานตัวที่ซ้ำ', async () => {
    const { path } = await tmpConfig();
    const c = await updateWishlist(path, [5555, 9999, 15], []);
    expect(c).toEqual({ added: [5555, 15], already: [9999], removed: [], notFound: [], total: 3 });
    expect(JSON.parse(await readFile(path, 'utf8')).wishlist.numbers).toEqual([15, 5555, 9999]);
  });
  it('ลบเลขที่กรอกผิดได้ และบอกถ้าไม่มีอยู่แล้ว', async () => {
    const { path } = await tmpConfig();
    await updateWishlist(path, [15], []);
    const c = await updateWishlist(path, [], [15, 42]);
    expect(c).toMatchObject({ removed: [15], notFound: [42], total: 1 });
    expect(JSON.parse(await readFile(path, 'utf8')).wishlist.numbers).toEqual([9999]);
  });
  it('ไม่มีอะไรเปลี่ยน → ไม่เขียนไฟล์', async () => {
    const { path } = await tmpConfig();
    const before = await readFile(path, 'utf8');
    await updateWishlist(path, [9999], [42]);
    expect(await readFile(path, 'utf8')).toBe(before);
  });
});

describe('เจ้าของเลข + ข้อความสรุป', () => {
  const entries = [{ vehicleType: 'car' as const, openDate: '2026-09-18', prefix: '8ขฉ', from: 5001, to: 6500, registerBy: '2026-10-18' }];
  it('updateOwners จำคนแรกที่เพิ่ม และคืนสถานะก่อนแก้', async () => {
    const { dir } = await tmpConfig();
    const statePath = join(dir, 'state.json');
    expect(await updateOwners(statePath, 'somchai', [5555], [])).toEqual({});
    const before = await updateOwners(statePath, 'nok', [5555, 6000], []);
    expect(before).toEqual({ 5555: 'somchai' });
    expect((await loadState(statePath)).owners).toEqual({ 5555: 'somchai', 6000: 'nok' });
    await updateOwners(statePath, 'nok', [], [5555]);
    expect((await loadState(statePath)).owners).toEqual({ 6000: 'nok' });
  });
  it('describeNumber บอกวันเปิด / วันนี้ / ผ่านแล้ว / ไม่อยู่ในตาราง', () => {
    expect(describeNumber(5555, entries, '2026-09-15')).toContain('อีก 3 วัน');
    expect(describeNumber(5555, entries, '2026-09-18')).toContain('วันนี้');
    expect(describeNumber(5555, entries, '2026-09-19')).toContain('เปิดไปแล้ว');
    expect(describeNumber(15, entries, '2026-09-15')).toContain('ยังไม่อยู่ในตาราง');
  });
  it('wishlistChangeText มีบรรทัดต่อเลขและเตือนเจ้าของเดิม', () => {
    const text = wishlistChangeText({ added: [5555], already: [6000], removed: [15], notFound: [42], total: 3 }, ['abc'], { 5555: 'somchai' }, 'nok', entries, '2026-09-15');
    expect(text).toContain('✅ **5555** เพิ่มแล้ว');
    expect(text).toContain('somchai เล็งไว้ก่อนแล้ว');
    expect(text).toContain('🗑️ **15**');
    expect(text).toContain('❔ **42**');
    expect(text).toContain('❌ "abc"');
    expect(text).toContain('wishlist ตอนนี้ 3 เลข');
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
