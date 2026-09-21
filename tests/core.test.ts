import { describe, expect, it } from 'vitest';
import { isStale, planNotifications } from '../src/core.js';
import type { Schedule } from '../src/schedule/types.js';

const schedule: Schedule = {
  sourceFileId: 'FILE', version: 'Mon, 14 Sep 2026 01:58:13 GMT', fetchedAt: '', entries: [
    { vehicleType: 'car', openDate: '2026-09-14', prefix: '8ขจ', from: 8001, to: 9999, registerBy: '2026-10-14' },
    { vehicleType: 'car', openDate: '2026-09-15', prefix: '8ขฉ', from: 1, to: 2000, registerBy: '2026-10-15' },
  ],
};
const config = { scheduleFileId: 'FILE', vehicleType: 'car' as const, wishlist: { numbers: [9999, 1234], patterns: [], digitSums: [], exclude: [], auction: [] }, reminders: { daysBeforeRegisterDeadline: [7, 1] } };

describe('planNotifications', () => {
  // ADR-0007: การ์ด 🎯 รายวันกับ ⏰ เตือนก่อนเปิด ย้ายไปอยู่การ์ดประจำวัน 09:30 แล้ว
  it('แจ้งแค่ตารางเวอร์ชันใหม่ ไม่ยิงการ์ด 🎯 และไม่เตือนล่วงหน้าซ้ำอีก', () => {
    const plan = planNotifications(schedule, config, { notified: [], lastScheduleVersion: 'old' }, '2026-09-14');
    const keys = plan.map((p) => p.key);
    expect(keys).toContain(`schedule:${schedule.version}`);
    expect(keys.some((k) => k.startsWith('match:'))).toBe(false);
    expect(keys.some((k) => k.startsWith('open:'))).toBe(false);
  });
  it('ไม่แจ้งตารางใหม่ในรอบแรกสุด (ยังไม่เคยเห็นเวอร์ชันไหนมาก่อน)', () => {
    const plan = planNotifications(schedule, config, { notified: [] }, '2026-09-15');
    expect(plan.map((p) => p.key).some((k) => k.startsWith('schedule:'))).toBe(false);
  });
  it('เตือนหมดเขตจดทะเบียน 7 วันก่อน', () => {
    const plan = planNotifications(schedule, config, { notified: [] }, '2026-10-07');
    expect(plan.map((p) => p.key)).toContain('deadline:2026-09-14:8ขจ:8001:7');
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
    expect(keys.some((k) => k.startsWith('schedule:'))).toBe(false);
  });
});
