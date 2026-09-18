import { describe, expect, it } from 'vitest';
import { digitSum, matchEntry, matchSchedule } from '../src/match.js';
import type { ScheduleEntry } from '../src/schedule/types.js';

const entry: ScheduleEntry = { vehicleType: 'car', openDate: '2026-09-14', prefix: '8ขจ', from: 8001, to: 9999, registerBy: '2026-10-14' };

describe('matchEntry', () => {
  it('เลขตรง wishlist', () => {
    const m = matchEntry(entry, { numbers: [8888, 1234], patterns: [], digitSums: [] });
    expect(m?.numbers).toEqual([8888]);
    expect(m?.reasons.get(8888)).toEqual(['เลขที่ระบุไว้']);
  });
  it('เลขตอง 4 ตัวจาก pattern', () => {
    const m = matchEntry(entry, { numbers: [], patterns: [{ name: 'เลขตอง', regex: '^(\\d)\\1{3}$' }], digitSums: [] });
    expect(m?.numbers).toEqual([8888, 9999]);
    expect(m?.reasons.get(8888)).toEqual(['เลขตอง']);
  });
  it('ผลรวมเลข', () => {
    expect(digitSum(8001)).toBe(9);
    const m = matchEntry({ ...entry, from: 8001, to: 8010 }, { numbers: [], patterns: [], digitSums: [9] });
    expect(m?.numbers).toEqual([8001, 8010]);
  });
  it('รวมเหตุผลเมื่อเลขเดียวตรงหลายข้อ', () => {
    const m = matchEntry(entry, { numbers: [9999], patterns: [{ name: 'เลขตอง', regex: '^(\\d)\\1{3}$' }], digitSums: [36] });
    expect(m?.reasons.get(9999)).toHaveLength(3);
  });
  it('exclude ตัดเลขออกแม้ตรง pattern หรือระบุไว้', () => {
    const m = matchEntry(entry, { numbers: [9999, 8888], patterns: [{ name: 'เลขตอง', regex: '^(\\d)\\1{3}$' }], digitSums: [], exclude: [9999] });
    expect(m?.numbers).toEqual([8888]);
  });
  it('null เมื่อไม่มีอะไรตรง', () => {
    expect(matchEntry(entry, { numbers: [1], patterns: [], digitSums: [] })).toBeNull();
  });
});

describe('matchSchedule', () => {
  it('กรองเฉพาะประเภทรถของเรา', () => {
    const van: ScheduleEntry = { ...entry, vehicleType: 'van', prefix: '1นฎ', from: 2801, to: 2900 };
    const config = { scheduleFileId: 'FILE', vehicleType: 'van' as const, wishlist: { numbers: [2888, 8888], patterns: [], digitSums: [] }, reminders: { daysBeforeOpen: [1], daysBeforeRegisterDeadline: [7, 1] } };
    const ms = matchSchedule([entry, van], config);
    expect(ms).toHaveLength(1);
    expect(ms[0].numbers).toEqual([2888]);
  });
});
