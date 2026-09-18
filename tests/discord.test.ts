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

import { guideEmbeds, panelEmbed } from '../src/notify/discord.js';
describe('คู่มือและแผงควบคุม', () => {
  it('guideEmbeds อยู่ในลิมิต Discord และครอบคลุมทุกปุ่ม', () => {
    const embeds = guideEmbeds();
    const json = JSON.stringify(embeds);
    for (const e of embeds) for (const f of e.fields ?? []) expect(f.value.length).toBeLessThanOrEqual(1024);
    expect(json.length).toBeLessThanOrEqual(6000);
    for (const label of ['กรอกเลขที่อยากจอง', 'เลขที่เฝ้าอยู่', 'แชร์เลข', 'ดูประวัติแชต', 'ลบประวัติแชตเก่า', 'เข้าสู่เว็บไซต์', 'ตารางสัปดาห์นี้', 'เลขในฝันรอบนี้', 'เช็คตอนนี้', 'สถานะ bot', 'คู่มือ']) expect(json).toContain(label);
  });
  it('panelEmbed มีช่องคู่มือ', () => {
    expect(JSON.stringify(panelEmbed({ wishlistCount: 3, version: 'v' }))).toContain('คู่มือ');
  });
});

import { scheduleEmbed, statusEmbed } from '../src/notify/discord.js';
import type { Schedule } from '../src/schedule/types.js';
describe('scheduleEmbed แบบมี config/today', () => {
  const schedule: Schedule = { sourceFileId: 'F', version: 'v1', fetchedAt: '', entries: [
    { vehicleType: 'car', openDate: '2026-09-14', prefix: '8ขจ', from: 8001, to: 9999, registerBy: '2026-10-14' },
    { vehicleType: 'car', openDate: '2026-09-18', prefix: '8ขฉ', from: 5001, to: 6500, registerBy: '2026-10-18' },
    { vehicleType: 'van', openDate: '2026-09-14', prefix: '1นฎ', from: 2801, to: 2900, registerBy: '2026-10-14' },
  ] };
  const config = { scheduleFileId: 'F', vehicleType: 'car' as const, wishlist: { numbers: [5555], patterns: [], digitSums: [] }, reminders: { daysBeforeOpen: [1], daysBeforeRegisterDeadline: [7, 1] } };
  it('ทำเครื่องหมายผ่านแล้ว/วันนี้/กำลังมา และ 🎯 วันที่มีเลขในฝัน + รถของคุณ', () => {
    const e = scheduleEmbed(schedule, { config, today: '2026-09-14', title: 'T' });
    const car = e.fields!.find((f) => f.name.includes('← รถของคุณ'))!;
    expect(car.value).toContain('🔥 **จ. 14 ก.ย.**');
    expect(car.value).toContain('⏳ **ศ. 18 ก.ย.** · **8ขฉ** 5001 – 6500 🎯 1 เลข');
    expect(e.fields!.find((f) => f.name.includes('รถตู้'))!.name).not.toContain('รถของคุณ');
    expect(e.title).toBe('T');
    expect(e.description).toContain('30 วันหลังวันเปิด');
  });
  it('ไม่มี today → ไม่มีไอคอนสถานะ (ใช้ตอนตารางรอบใหม่)', () => {
    const e = scheduleEmbed(schedule);
    expect(e.fields![0].value).toContain('▫️');
    expect(e.description).not.toContain('ผ่านไปแล้ว');
  });
  it('statusEmbed บอกเลขในฝันเปิดครั้งถัดไป', () => {
    const e = statusEmbed({ startedAt: new Date(Date.now() - 90 * 60000), wishlistCount: 3, patternCount: 2, vehicleType: 'car', today: '2026-09-15', nextMatchDate: '2026-09-18' });
    expect(JSON.stringify(e)).toContain('1 ชม. 30 นาที');
    expect(JSON.stringify(e)).toContain('อีก 3 วัน');
  });
});

import { wishlistEmbed } from '../src/notify/discord.js';
describe('wishlistEmbed', () => {
  it('แสดงทุกเลข สถานะกับตาราง เจ้าของ และ pattern', () => {
    const config = { scheduleFileId: 'F', vehicleType: 'car' as const, wishlist: { numbers: [15, 5555, 9999], patterns: [{ name: 'เลขตอง', regex: 'x' }], digitSums: [9] }, reminders: { daysBeforeOpen: [1], daysBeforeRegisterDeadline: [7, 1] } };
    const entries = [{ vehicleType: 'car' as const, openDate: '2026-09-18', prefix: '8ขฉ', from: 5001, to: 6500, registerBy: '2026-10-18' }, { vehicleType: 'car' as const, openDate: '2026-09-14', prefix: '8ขจ', from: 8001, to: 9999, registerBy: '2026-10-14' }];
    const e = wishlistEmbed(config, { 5555: 'somchai' }, entries, '2026-09-15');
    const v = e.fields![0].value;
    expect(v).toContain('`15` 🔭');
    expect(v).toContain('`5555` ⏳ ศ. 18 ก.ย. 8ขฉ (อีก 3 วัน) · 👤 somchai');
    expect(v).toContain('`9999` ⏪');
    expect(JSON.stringify(e)).toContain('เลขตอง');
  });
  it('wishlist ว่างก็ยังแสดงได้', () => {
    const config = { scheduleFileId: 'F', vehicleType: 'van' as const, wishlist: { numbers: [], patterns: [], digitSums: [] }, reminders: { daysBeforeOpen: [1], daysBeforeRegisterDeadline: [7, 1] } };
    expect(wishlistEmbed(config, {}, [], '2026-09-15').fields![0].value).toContain('ยังไม่มี');
  });
});
