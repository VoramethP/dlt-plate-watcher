import { describe, expect, it } from 'vitest';
import { isStale, planNotifications, wishlistHash } from '../src/core.js';
import type { Schedule } from '../src/schedule/types.js';

const schedule: Schedule = {
  sourceFileId: 'FILE', version: 'Mon, 14 Sep 2026 01:58:13 GMT', fetchedAt: '', entries: [
    { vehicleType: 'car', openDate: '2026-09-14', prefix: '8ขจ', from: 8001, to: 9999, registerBy: '2026-10-14' },
    { vehicleType: 'car', openDate: '2026-09-15', prefix: '8ขฉ', from: 1, to: 2000, registerBy: '2026-10-15' },
  ],
};
const config = { scheduleFileId: 'FILE', vehicleType: 'car' as const, wishlist: { numbers: [9999, 1234], patterns: [], digitSums: [] }, reminders: { daysBeforeOpen: [1], daysBeforeRegisterDeadline: [7, 1] } };

describe('planNotifications', () => {
  it('แจ้ง match ที่ยังไม่ถึงวัน + เตือนล่วงหน้า 1 วัน + ตารางเวอร์ชันใหม่', () => {
    const plan = planNotifications(schedule, config, { notified: [], lastScheduleVersion: 'old' }, '2026-09-14');
    const keys = plan.map((p) => p.key);
    expect(keys).toContain(`schedule:${schedule.version}`);
    const h = wishlistHash(config.wishlist);
    expect(keys).toContain(`match:2026-09-14:8ขจ:8001-9999:${h}`);
    expect(keys).toContain(`match:2026-09-15:8ขฉ:1-2000:${h}`);
    expect(keys).toContain('open:2026-09-15:8ขฉ:1:1');
  });
  it('ไม่แจ้ง match ของวันที่ผ่านไปแล้ว และไม่แจ้งตารางใหม่ในรอบแรกสุด', () => {
    const plan = planNotifications(schedule, config, { notified: [] }, '2026-09-15');
    const keys = plan.map((p) => p.key);
    expect(keys.some((k) => k.startsWith('match:2026-09-14'))).toBe(false);
    expect(keys.some((k) => k.startsWith('schedule:'))).toBe(false);
  });
  it('เตือนหมดเขตจดทะเบียน 7 วันก่อน', () => {
    const plan = planNotifications(schedule, config, { notified: [] }, '2026-10-07');
    expect(plan.map((p) => p.key)).toContain('deadline:2026-09-14:8ขจ:8001:7');
  });
});

describe('เปลี่ยน wishlist', () => {
  it('ช่วงเดิมได้ key ใหม่ จึงถูกแจ้งอีกครั้ง', () => {
    const before = planNotifications(schedule, config, { notified: [] }, '2026-09-14').map((p) => p.key);
    const changed = { ...config, wishlist: { ...config.wishlist, numbers: [8888] } };
    const after = planNotifications(schedule, changed, { notified: before }, '2026-09-14')
      .filter((p) => !before.includes(p.key)).map((p) => p.key);
    expect(after.some((k) => k.startsWith('match:2026-09-14:8ขจ'))).toBe(true);
  });
});

describe('ตารางหมดอายุ', () => {
  it('stale เมื่อทุกวันเปิดจองผ่านไปแล้ว', () => {
    expect(isStale(schedule, '2026-09-15')).toBe(false);
    expect(isStale(schedule, '2026-09-16')).toBe(true);
  });
  it('เมื่อ stale แจ้งเรื่องตารางเก่า ไม่ match แต่ยังเตือนกำหนดจดทะเบียนอยู่', () => {
    const plan = planNotifications(schedule, config, { notified: [], lastScheduleVersion: 'old' }, '2026-10-07');
    const keys = plan.map((p) => p.key);
    expect(keys).toContain('stale:FILE');
    expect(keys).toContain('deadline:2026-09-14:8ขจ:8001:7');
    expect(keys.some((k) => k.startsWith('match:') || k.startsWith('schedule:') || k.startsWith('open:'))).toBe(false);
  });
});
