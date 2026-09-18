import { describe, expect, it } from 'vitest';
import { daysBetween, formatThaiDate, minutesOfDayBangkok, parseThaiDate, todayBangkok } from '../src/thai-date.js';

describe('parseThaiDate', () => {
  it('แปลง พ.ศ. + เดือนไทย เป็น ISO', () => {
    expect(parseThaiDate('14 กันยายน 2569')).toBe('2026-09-14');
    expect(parseThaiDate('1 มกราคม 2570')).toBe('2027-01-01');
  });
  it('คืน null เมื่ออ่านไม่ออกหรือวันไม่มีจริง', () => {
    expect(parseThaiDate('14 Sep 2026')).toBeNull();
    expect(parseThaiDate('31 กุมภาพันธ์ 2569')).toBeNull();
  });
});

describe('formatThaiDate', () => {
  it('กลับเป็นไทยพร้อมชื่อวัน', () => {
    expect(formatThaiDate('2026-09-14')).toBe('จันทร์ 14 กันยายน 2569');
    expect(formatThaiDate('2026-10-14', false)).toBe('14 ตุลาคม 2569');
  });
});

describe('เวลาไทย', () => {
  it('todayBangkok ข้ามวันก่อน UTC 7 ชั่วโมง', () => {
    expect(todayBangkok(new Date('2026-09-14T17:30:00Z'))).toBe('2026-09-15');
    expect(todayBangkok(new Date('2026-09-14T16:59:00Z'))).toBe('2026-09-14');
  });
  it('minutesOfDayBangkok', () => {
    expect(minutesOfDayBangkok(new Date('2026-09-14T03:00:00Z'))).toBe(10 * 60);
  });
  it('daysBetween', () => {
    expect(daysBetween('2026-09-14', '2026-10-14')).toBe(30);
    expect(daysBetween('2026-09-15', '2026-09-14')).toBe(-1);
  });
});
