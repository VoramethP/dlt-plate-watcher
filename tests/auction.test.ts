// เลขที่ขนส่งกันไว้ประมูล (ADR-0006) — เทสอ่าน auction-rules.json ของจริงในรีโป ไม่แตะเครือข่าย
import { describe, expect, it } from 'vitest';
import { auctionIndex, loadAuctionRules, MANUAL_GROUP, splitAuction } from '../src/auction.js';
import { matchEntry } from '../src/match.js';
import { matchEmbed, wishlistEmbed } from '../src/notify/discord.js';
import { planNotifications } from '../src/core.js';
import type { Schedule, ScheduleEntry } from '../src/schedule/types.js';

const rules = await loadAuctionRules();
const index = auctionIndex(rules);

describe('auction-rules.json ตรงกับตารางแนบท้ายประกาศ', () => {
  it('ครบ 301 หมายเลขตามที่ประกาศระบุ และไม่มีเลขอยู่สองกลุ่ม', () => {
    const all = rules.groups.flatMap((g) => g.numbers);
    expect(rules.total).toBe(301);
    expect(all).toHaveLength(301);
    expect(new Set(all).size).toBe(301);
    expect(rules.sources.length).toBeGreaterThanOrEqual(1); // ต้องอ้างแหล่งได้เสมอ เหมือน numerology.json
  });

  it('จัดกลุ่มถูกตามประกาศ', () => {
    const group = (n: number) => index.get(n);
    expect(group(8888)).toBe('เลขสี่ตัวเหมือน');
    expect(group(555)).toBe('เลขสามตัวเหมือน');
    expect(group(77)).toBe('เลขสองตัวเหมือน');
    expect(group(9)).toBe('เลขตัวเดียว');
    expect(group(8899)).toBe('เลขคู่ 8 เลขคู่ 9');
    expect(group(5000)).toBe('เลขหลักพัน');
    expect(group(789)).toBe('เลขเรียง');
    expect(group(6789)).toBe('เลขเรียง');
    expect(group(6464)).toBe('เลขคู่'); // abab
    expect(group(6644)).toBe('เลขคู่'); // aabb
    expect(group(6446)).toBe('เลขคู่'); // abba
  });

  it('เลขธรรมดาไม่โดนกรอง', () => {
    for (const n of [15, 24, 5456, 6501, 1357, 9876, 1115, 2026]) expect(index.has(n)).toBe(false);
  });

  it('เลขที่ผู้ใช้ทำเครื่องหมายเองถูกนับเป็นเลขประมูลด้วย', () => {
    const withManual = auctionIndex(rules, [5456]);
    expect(withManual.get(5456)).toBe(MANUAL_GROUP);
    expect(splitAuction([15, 5456, 8888], withManual)).toEqual({
      bookable: [15],
      auction: [{ n: 5456, group: MANUAL_GROUP }, { n: 8888, group: 'เลขสี่ตัวเหมือน' }],
    });
  });
});

const entry: ScheduleEntry = { vehicleType: 'car', openDate: '2026-09-25', prefix: '8ขช', from: 7501, to: 9999, registerBy: '2026-10-26' };
const wishlist = { numbers: [8888, 9999, 7788, 7890], patterns: [], digitSums: [], auction: [] };

describe('การ์ด 🎯 แยกเลขประมูลออกจากเลขที่จองได้', () => {
  it('numbers เหลือเฉพาะเลขที่จองออนไลน์ได้ · เลขประมูลไปอยู่ auction พร้อมชื่อกลุ่ม', () => {
    const m = matchEntry(entry, wishlist, index)!;
    expect(m.numbers).toEqual([7890]); // 7890 ไม่ใช่เลขเรียง (0 ไม่ต่อจาก 9) จึงจองได้
    expect(m.auction).toEqual([
      { n: 7788, group: 'เลขคู่' },
      { n: 8888, group: 'เลขสี่ตัวเหมือน' },
      { n: 9999, group: 'เลขสี่ตัวเหมือน' },
    ]);
    // เหตุผลยังอยู่ครบ ผู้ใช้ยังรู้ว่าทำไมเลขนี้โผล่มา
    expect(m.reasons.get(8888)).toEqual(['เลขที่ระบุไว้']);
  });

  it('การ์ดมีช่อง 🔨 บอกกลุ่ม และนับเลขที่จองได้จริงในคำอธิบาย', () => {
    const embed = matchEmbed(matchEntry(entry, wishlist, index)!);
    const json = JSON.stringify(embed);
    expect(embed.description).toContain('จองออนไลน์ได้ **1** เลข');
    expect(embed.description).toContain('🔨 ต้องประมูลอีก **3** เลข');
    expect(json).toContain('🔨 ต้องประมูล จองออนไลน์ไม่ได้ (3)');
    expect(json).toContain('**เลขสี่ตัวเหมือน** `8888` · `9999`');
    expect(embed.fields!.find((f) => f.name.startsWith('เลขที่ระบุไว้'))!.value).not.toContain('8888');
  });

  it('ทั้งวันมีแต่เลขประมูล → ไม่แจ้งเตือน (กดจองไม่ได้สักเลข) แต่ยังดูได้จากปุ่ม 🎯', () => {
    const schedule: Schedule = { sourceFileId: 'F', version: 'v1', fetchedAt: '', entries: [entry] };
    const config = {
      scheduleFileId: 'F', vehicleType: 'car' as const,
      wishlist: { numbers: [8888, 9999], patterns: [], digitSums: [], exclude: [], auction: [] },
      reminders: { daysBeforeOpen: [1], daysBeforeRegisterDeadline: [7, 1] },
    };
    const plan = planNotifications(schedule, config, { notified: [] }, '2026-09-22', undefined, index);
    expect(plan.some((p) => p.key.startsWith('match:'))).toBe(false);
    // แต่ matchEntry ยังคืนการ์ดให้ปุ่ม 🎯 ใช้
    expect(matchEntry(entry, config.wishlist, index)!.auction).toHaveLength(2);
  });
});

describe('📋 เลขที่เฝ้าอยู่ แยกช่องเลขประมูล', () => {
  it('เลขประมูลไม่ปนกับเลขที่รอเปิดจอง', () => {
    const config = {
      scheduleFileId: 'F', vehicleType: 'car' as const,
      wishlist: { numbers: [15, 8888, 9999], patterns: [], digitSums: [], exclude: [], auction: [] },
      reminders: { daysBeforeOpen: [1], daysBeforeRegisterDeadline: [7, 1] },
    };
    const e = wishlistEmbed(config, {}, [entry], '2026-09-22', undefined, index);
    expect(e.fields![0].name).toBe('✅ จองออนไลน์ได้ (1)');
    expect(e.fields![0].value).toContain('`15`');
    expect(e.fields![0].value).not.toContain('8888');
    expect(e.fields![1].name).toBe('🔨 ต้องประมูล จองออนไลน์ไม่ได้ (2)');
    expect(e.fields![1].value).toContain('`8888`');
  });
});
