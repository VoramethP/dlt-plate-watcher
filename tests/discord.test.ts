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
    // ชิปไม่มีหมวดซ้ำ และคั่นด้วย · (ผู้ใช้บอกว่าติดกันอ่านยาก)
    expect(json).toContain('`5050` · `5151` · `5252`');
    expect(json).not.toContain('`8ขฉ 5050`');
    expect(json).toContain('ทุกเลขด้านล่างคือหมวด **8ขฉ**');
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
    for (const label of ['กรอกเลขที่อยากจอง', 'เลขที่เฝ้าอยู่', 'แชร์เลข', 'ดูประวัติแชต', 'ลบประวัติแชตเก่า', 'เข้าสู่เว็บไซต์', 'ตารางสัปดาห์นี้', 'เลขในฝันรอบนี้', 'เช็คตอนนี้', 'คู่มือ']) expect(json).toContain(label);
  });
  it('landing panel: headline เปลี่ยนตามสถานการณ์ และสรุป wishlist', () => {
    const entry = { vehicleType: 'car' as const, openDate: '2026-09-18', prefix: '8ขฉ', from: 5001, to: 6500, registerBy: '2026-10-18' };
    const config = { scheduleFileId: 'F', vehicleType: 'car' as const, wishlist: { numbers: [5555, 9999], patterns: [{ name: 'ตอง', regex: 'x' }], digitSums: [], exclude: [4444] }, reminders: { daysBeforeOpen: [1], daysBeforeRegisterDeadline: [7, 1] } };
    const match = { entry, numbers: [5555], reasons: new Map([[5555, ['ตอง']]]), reasonOrder: ['ตอง'] };
    const base = { config, entries: [entry], matches: [match], version: 'Mon, 14 Sep 2026 01:58:13 GMT' };
    const upcoming = panelEmbed({ ...base, today: '2026-09-15' });
    expect(upcoming.description).toContain('⏳ เลขในฝันเปิดครั้งถัดไป **ศ. 18 ก.ย.** (อีก 3 วัน)');
    expect(JSON.stringify(upcoming)).toContain('2 เลข · 1 รูปแบบ · 🚫 1');
    expect(JSON.stringify(upcoming)).toContain('อัปเดต Mon, 14 Sep 2026 01:58');
    expect(panelEmbed({ ...base, today: '2026-09-18' }).description).toContain('🔥 **วันนี้เปิดจอง**');
    expect(panelEmbed({ ...base, today: '2026-09-19' }).description).toContain('😴');
    expect(panelEmbed({ ...base, today: '2026-09-19', stale: true }).description).toContain('🗓️');
    expect(panelEmbed({ ...base, entries: [], matches: [], today: '2026-09-15' }).description).toContain('⚠️');
  });
});

import { scheduleEmbed } from '../src/notify/discord.js';
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
});

import { fitField, wishlistEmbed } from '../src/notify/discord.js';
import { loadNumerology } from '../src/numerology.js';
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
  it('มีเลขศาสตร์ครบทุกเลข field ต้องไม่เกิน 1024 (เคยพัง 20 ก.ย. บน Discord จริง)', async () => {
    const numerology = await loadNumerology();
    const config = { scheduleFileId: 'F', vehicleType: 'car' as const, wishlist: { numbers: [15, 24, 42, 45, 51, 54, 56, 65, 1234, 5678, 9012, 3456], patterns: [], digitSums: [] }, reminders: { daysBeforeOpen: [1], daysBeforeRegisterDeadline: [7, 1] } };
    const entries = [{ vehicleType: 'car' as const, openDate: '2026-09-18', prefix: '8ขฉ', from: 1, to: 9999, registerBy: '2026-10-18' }];
    const e = wishlistEmbed(config, {}, entries, '2026-09-15', numerology);
    for (const f of e.fields!) expect(f.value.length).toBeLessThanOrEqual(1024);
    expect(e.fields![0].value).toMatch(/…และอีก \d+ เลข$/);
    expect(fitField(['a'.repeat(600), 'b'.repeat(600), 'c'], 'เลข')).toBe('a'.repeat(600) + '\n…และอีก 2 เลข');
  });
  it('wishlist ว่างก็ยังแสดงได้', () => {
    const config = { scheduleFileId: 'F', vehicleType: 'van' as const, wishlist: { numbers: [], patterns: [], digitSums: [] }, reminders: { daysBeforeOpen: [1], daysBeforeRegisterDeadline: [7, 1] } };
    expect(wishlistEmbed(config, {}, [], '2026-09-15').fields![0].value).toContain('ยังไม่มี');
  });
});

import { chunkEmbeds, clampEmbed, embedChars, MESSAGE_CHAR_BUDGET, type Embed } from '../src/notify/discord.js';
describe('ลิมิต "ทุก embed ในข้อความเดียวรวมกัน 6000 ตัวอักษร"', () => {
  const card = (title: string, chars: number): Embed => ({ title, fields: [{ name: 'f', value: 'x'.repeat(chars) }] });
  const chars = (chunk: Embed[]) => chunk.reduce((n, e) => n + embedChars(e), 0);

  it('แบ่งเป็นหลายข้อความเมื่อรวมกันเกินงบ (เคยพัง 21 ก.ย.: 5 การ์ด match + เตือน = 6230 → HTTP 400)', () => {
    const chunks = chunkEmbeds([card('a', 1300), card('b', 1330), card('c', 1110), card('d', 1120), card('e', 1140), card('f', 200)]);
    expect(chunks.length).toBe(2);
    expect(chunks.flat()).toHaveLength(6); // ไม่หายสักใบ
    for (const c of chunks) expect(chars(c)).toBeLessThanOrEqual(6000);
  });

  it('ยังจำกัด 10 ใบต่อข้อความเหมือนเดิม', () => {
    const chunks = chunkEmbeds(Array.from({ length: 12 }, (_, i) => card(`t${i}`, 10)));
    expect(chunks.map((c) => c.length)).toEqual([10, 2]);
  });

  it('embed ใบเดียวที่เกินงบ → ตัด field ท้ายทิ้ง ไม่ใช่ส่งไม่ออกทั้งใบ', () => {
    const huge: Embed = { title: 'ใหญ่', fields: Array.from({ length: 10 }, (_, i) => ({ name: `g${i}`, value: 'y'.repeat(1000) })) };
    const clamped = clampEmbed(huge);
    expect(embedChars(clamped)).toBeLessThanOrEqual(MESSAGE_CHAR_BUDGET);
    expect(clamped.fields!.at(-1)!.value).toContain('ตัดไป');
    for (const c of chunkEmbeds([huge, huge])) expect(chars(c)).toBeLessThanOrEqual(6000);
  });

  it('ตารางรอบใหม่ 5 วันของจริง → ทุกข้อความอยู่ในลิมิต', async () => {
    const numerology = await loadNumerology();
    const days = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
    const w = { numbers: [15, 24, 42, 45, 51, 54, 56, 65, 5456, 8888, 9999], patterns: [{ name: 'เลขคู่สลับ', regex: '^(\\d)(\\d)\\1\\2$' }], digitSums: [9] };
    const embeds = days.map((openDate, i) => matchEmbed(matchEntry({ vehicleType: 'car', openDate, prefix: '8ขช', from: i * 2000 + 1, to: (i + 1) * 2000, registerBy: '2026-10-21' }, w)!, numerology));
    expect(embeds.reduce((n, e) => n + embedChars(e), 0)).toBeGreaterThan(6000); // ของจริงเกินแน่
    const chunks = chunkEmbeds(embeds);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(chars(c)).toBeLessThanOrEqual(6000);
  });
});
