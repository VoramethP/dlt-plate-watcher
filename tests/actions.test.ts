import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coveredBy, embedToText, readPatternRules, DISCORD_LIMITS, MODAL_TEXT, buttonRows, clampReply, panelRows, describeKey, describeNumber, formatHistory, parseNumbers, updateOwners, updateWishlist, wishlistChangeText } from '../src/notify/actions.js';
import { loadState } from '../src/state.js';

describe('ปุ่มใต้การ์ดแจ้งเตือน', () => {
  it('เหลือแค่ 📤 แชร์เลข กับ 🌐 เข้าสู่เว็บไซต์ (ที่เหลืออยู่บน landing panel)', () => {
    const rows = buttonRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].components.map((c) => c.label)).toEqual(['แชร์เลข', 'เข้าสู่เว็บไซต์']);
    const link = rows[0].components[1] as { style: number; url?: string };
    expect(link.style).toBe(5);
    expect(link.url).toContain('reserve.dlt.go.th');
  });
});

describe('landing panel: แถวทำ + แถวดู', () => {
  it('ค่าเริ่มต้น 2 แถว: ทำ 4 ปุ่ม · ดู 5 ปุ่ม (ไม่เกิน 5 ต่อแถว)', () => {
    delete process.env.DISCORD_BUTTONS_PER_ROW;
    const rows = panelRows();
    expect(rows.map((r) => r.components.map((c) => c.label))).toEqual([
      ['กรอกเลขที่อยากจอง', 'เลขที่เฝ้าอยู่', 'ลบประวัติแชตเก่า', 'เข้าสู่เว็บไซต์'],
      ['ตาราง', 'เลขในฝัน', 'เช็คตอนนี้', 'ประวัติ', 'คู่มือ'],
    ]);
    expect(rows.every((r) => r.type === 1 && r.components.length <= 5)).toBe(true);
  });
  it('DISCORD_BUTTONS_PER_ROW=2 → แบ่งแถวละ 2 ทั้งสองกลุ่ม', () => {
    process.env.DISCORD_BUTTONS_PER_ROW = '2';
    expect(panelRows().map((r) => r.components.length)).toEqual([2, 2, 2, 2, 1]);
    delete process.env.DISCORD_BUTTONS_PER_ROW;
  });
  it('ค่าเพี้ยน → กลับไปค่าเริ่มต้น', () => {
    process.env.DISCORD_BUTTONS_PER_ROW = '9';
    expect(panelRows()).toHaveLength(2);
    delete process.env.DISCORD_BUTTONS_PER_ROW;
  });
});

describe('ข้อความใน modal อยู่ในลิมิต Discord', () => {
  // เคยพัง 18 ก.ย.: label ยาวเกิน 45 → discord.js โยน "Invalid string length" → ผู้ใช้เห็น "ไม่ตอบสนองในเวลาที่กำหนด"
  it('title/label ≤ 45 · placeholder ≤ 100', () => {
    expect(MODAL_TEXT.title.length).toBeLessThanOrEqual(DISCORD_LIMITS.modalTitle);
    expect(MODAL_TEXT.addLabel.length).toBeLessThanOrEqual(DISCORD_LIMITS.inputLabel);
    expect(MODAL_TEXT.removeLabel.length).toBeLessThanOrEqual(DISCORD_LIMITS.inputLabel);
    expect(MODAL_TEXT.addPlaceholder.length).toBeLessThanOrEqual(DISCORD_LIMITS.placeholder);
    expect(MODAL_TEXT.removePlaceholder.length).toBeLessThanOrEqual(DISCORD_LIMITS.placeholder);
    expect(MODAL_TEXT.excludeLabel.length).toBeLessThanOrEqual(DISCORD_LIMITS.inputLabel);
    expect(MODAL_TEXT.excludePlaceholder.length).toBeLessThanOrEqual(DISCORD_LIMITS.placeholder);
  });
});

describe('embedToText — สำหรับปุ่ม 📤 แชร์เลข', () => {
  it('ตัด markdown และเรียง field เป็นบรรทัดอ่านง่าย', () => {
    const text = embedToText({ title: '🎯 เลขที่เล็งไว้จะเปิดจอง ศุกร์ 18 กันยายน 2569', description: 'รถเก๋ง\nช่วงที่เปิด: **8ขฉ** 5001 – 6500', fields: [{ name: 'เลขตอง (1)', value: '`8ขฉ 5555`' }, { name: 'เลขคู่สลับ (2)', value: '`8ขฉ 5050`  `8ขฉ 5151`\n`8ขฉ 5252`' }, { name: 'เปิดจอง', value: '10:00 – 16:00 น.' }] });
    expect(text).toBe('🎯 เลขที่เล็งไว้จะเปิดจอง ศุกร์ 18 กันยายน 2569\nรถเก๋ง\nช่วงที่เปิด: 8ขฉ 5001 – 6500\nเลขตอง (1): 8ขฉ 5555\nเลขคู่สลับ (2):\n8ขฉ 5050  8ขฉ 5151\n8ขฉ 5252\nเปิดจอง: 10:00 – 16:00 น.');
    expect(text).not.toContain('**');
  });
});

describe('clampReply', () => {
  it('ตัดให้ไม่เกินลิมิต Discord', () => {
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
    expect(c).toMatchObject({ added: [5555, 15], already: [9999], removed: [], notFound: [], total: 3, numbers: [15, 5555, 9999], exclude: [] });
    expect(JSON.parse(await readFile(path, 'utf8')).wishlist.numbers).toEqual([15, 5555, 9999]);
  });
  it('ลบเลขที่กรอกผิดได้ และบอกถ้าไม่มีอยู่แล้ว', async () => {
    const { path } = await tmpConfig();
    await updateWishlist(path, [15], []);
    const c = await updateWishlist(path, [], [15, 42]);
    expect(c).toMatchObject({ removed: [15], notFound: [42], total: 1 });
    expect(JSON.parse(await readFile(path, 'utf8')).wishlist.numbers).toEqual([9999]);
  });
  it('ไม่อยากได้: ย้ายออกจากอยากได้ · ลบได้ · เพิ่มกลับได้', async () => {
    const { path } = await tmpConfig();
    let c = await updateWishlist(path, [], [], [9999, 4444]);
    expect(c).toMatchObject({ excluded: [9999, 4444], numbers: [], exclude: [4444, 9999], total: 0 });
    c = await updateWishlist(path, [], [], [4444]);
    expect(c.alreadyExcluded).toEqual([4444]);
    c = await updateWishlist(path, [9999], [4444], []);
    expect(c).toMatchObject({ added: [9999], unexcluded: [9999], removed: [4444], exclude: [], numbers: [9999] });
    expect(JSON.parse(await readFile(path, 'utf8')).wishlist).toMatchObject({ numbers: [9999], exclude: [] });
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
    const text = wishlistChangeText({ added: [5555], already: [6000], removed: [15], notFound: [42], total: 3, numbers: [5555, 6000, 9999], excluded: [4444], alreadyExcluded: [], unexcluded: [], exclude: [4444] }, ['abc'], { 5555: 'somchai' }, 'nok', entries, '2026-09-15');
    expect(text).toContain('✅ **5555** เพิ่มแล้ว');
    expect(text).toContain('somchai เล็งไว้ก่อนแล้ว');
    expect(text).toContain('🗑️ **15**');
    expect(text).toContain('❔ **42**');
    expect(text).toContain('❌ "abc"');
    expect(text).toContain('เลขที่เฝ้าอยู่ตอนนี้ (3):** `5555` `6000` `9999`');
    expect(text).toContain('🚫 **4444** ใส่รายการไม่อยากได้แล้ว');
    expect(text).toContain('ไม่อยากได้ (1):** `4444`');
  });
});

describe('เตือนเลขที่ pattern ครอบอยู่แล้ว', () => {
  const rules = { patterns: [{ name: 'เลขตอง', regex: '^(\\d)\\1{2,3}$' }, { name: 'คู่สลับ', regex: '^(\\d)(\\d)\\1\\2$' }], digitSums: [9] };
  it('coveredBy คืนชื่อกฎทุกข้อที่ครอบ', () => {
    expect(coveredBy(5555, rules)).toEqual(['เลขตอง', 'คู่สลับ']);
    expect(coveredBy(5050, rules)).toEqual(['คู่สลับ']);
    expect(coveredBy(18, rules)).toEqual(['ผลรวม 9']);
    expect(coveredBy(1234, rules)).toEqual([]);
    expect(coveredBy(5555, { patterns: [{ name: 'พัง', regex: '(' }], digitSums: [] })).toEqual([]); // regex พังไม่ทำให้ล้ม
  });
  it('wishlistChangeText ใส่คำเตือนเฉพาะเลขที่ถูกครอบ', () => {
    const entries = [{ vehicleType: 'car' as const, openDate: '2026-09-18', prefix: '8ขฉ', from: 5001, to: 6500, registerBy: '2026-10-18' }];
    const text = wishlistChangeText({ added: [5555, 1234], already: [], removed: [], notFound: [], total: 2, numbers: [1234, 5555], excluded: [], alreadyExcluded: [], unexcluded: [], exclude: [] }, [], {}, 'nok', entries, '2026-09-15', rules);
    expect(text).toContain('**5555** เพิ่มแล้ว');
    expect(text).toContain('ถูกเฝ้าอยู่แล้วผ่านรูปแบบ "เลขตอง", "คู่สลับ"');
    expect(text.split('💡')).toHaveLength(2); // 1234 ไม่โดนเตือน
  });
  it('readPatternRules รับทั้ง string และ {name, regex}', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dlt-'));
    const path = join(dir, 'c.json');
    await writeFile(path, JSON.stringify({ wishlist: { numbers: [], patterns: ['^9+$', { name: 'ตอง', regex: '^(\\d)\\1{2}$' }], digitSums: [24] } }));
    expect(await readPatternRules(path)).toEqual({ patterns: [{ name: '^9+$', regex: '^9+$' }, { name: 'ตอง', regex: '^(\\d)\\1{2}$' }], digitSums: [24] });
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
