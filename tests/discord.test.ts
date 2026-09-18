import { describe, expect, it } from 'vitest';
import { matchEntry } from '../src/match.js';
import { groupByReason, matchEmbed } from '../src/notify/discord.js';
import type { ScheduleEntry } from '../src/schedule/types.js';

const entry: ScheduleEntry = { vehicleType: 'car', openDate: '2026-09-18', prefix: '8ขฉ', from: 5001, to: 6500, registerBy: '2026-10-18' };
const wishlist = { numbers: [5555, 6000], patterns: [{ name: 'เลขคู่สลับ', regex: '^(\\d)(\\d)\\1\\2$' }], digitSums: [] };

describe('matchEmbed จัดกลุ่มตามเหตุผล', () => {
  const m = matchEntry(entry, wishlist)!;
  it('1 field ต่อเหตุผล เรียงตาม config และไม่มี regex โผล่', () => {
    const groups = groupByReason(m);
    expect(groups.map((g) => g.reason)).toEqual(['เลขที่ระบุไว้', 'เลขคู่สลับ']);
    expect(groups[0].numbers).toEqual([5555, 6000]);
    expect(groups[1].numbers).toContain(5050);
    expect(groups[1].numbers).toContain(5555); // ตรงทั้งสองเหตุผล โผล่ทั้งสองกลุ่ม
    const json = JSON.stringify(matchEmbed(m));
    expect(json).not.toContain('\\d');
    expect(json).toContain('เลขคู่สลับ (15)');
  });
  it('ทุก field ไม่เกินลิมิต 1024 ตัวอักษรของ Discord', () => {
    const big = matchEntry({ ...entry, from: 1, to: 9999 }, { numbers: [], patterns: [{ name: 'ทุกเลข', regex: '.' }], digitSums: [] })!;
    for (const f of matchEmbed(big).fields!) expect(f.value.length).toBeLessThanOrEqual(1024);
    expect(JSON.stringify(matchEmbed(big))).toContain('และอีก');
  });
});
