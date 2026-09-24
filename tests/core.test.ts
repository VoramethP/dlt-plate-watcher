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
  // ADR-0008: เตือนจดทะเบียนมาจากรายการที่ผู้ใช้กด 🏆 บอกเอง ไม่ใช่จากตารางรายสัปดาห์ (แถวนั้นหายก่อนถึงกำหนดเสมอ)
  it('ไม่เตือนจดทะเบียนจากตาราง แม้แถวในตารางจะใกล้ครบกำหนด', () => {
    const plan = planNotifications(schedule, config, { notified: [] }, '2026-10-07');
    expect(plan.map((p) => p.key).some((k) => k.startsWith('deadline:'))).toBe(false);
  });
  it('เตือนจากรายการ "จองได้แล้ว" ตามวันที่ตั้งไว้ (7 และ 1 วัน) และหยุดเมื่อเลยกำหนด', () => {
    const won = [{ prefix: '8ขช', number: 5456, registerBy: '2026-10-26', by: 'Hope', at: '' }];
    const key = 'won:8ขช:5456:2026-10-26:7';
    expect(planNotifications(schedule, config, { notified: [] }, '2026-10-19', undefined, won).map((p) => p.key)).toContain(key);
    expect(planNotifications(schedule, config, { notified: [] }, '2026-10-25', undefined, won).map((p) => p.key)).toContain('won:8ขช:5456:2026-10-26:1');
    for (const day of ['2026-10-20', '2026-10-26', '2026-10-27']) {
      expect(planNotifications(schedule, config, { notified: [] }, day, undefined, won).map((p) => p.key).some((k) => k.startsWith('won:'))).toBe(false);
    }
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
    expect(keys.some((k) => k.startsWith('schedule:'))).toBe(false);
    // ตารางค้างไม่ควรทำให้หยุดเตือนจดทะเบียน — กำหนดจดยังเดินอยู่
    const won = [{ prefix: '8ขช', number: 5456, registerBy: '2026-10-14', by: '', at: '' }];
    expect(planNotifications(schedule, config, { notified: [] }, '2026-10-07', undefined, won).map((p) => p.key)).toContain('won:8ขช:5456:2026-10-14:7');
  });
});
