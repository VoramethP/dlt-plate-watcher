// ประกอบการ์ดประจำวัน — ไม่แตะ Discord เลย (interactions.sendDaily เป็นคนส่ง · cli.ts ใช้พรีวิวบนเครื่อง)
import type { AuctionIndex } from './auction.js';
import type { Config } from './config.js';
import { isStale } from './core.js';
import { matchSchedule } from './match.js';
import type { Numerology } from './numerology.js';
import { dailyEmbed, type Embed } from './notify/discord.js';
import type { Schedule } from './schedule/types.js';
import { suggestNumbers } from './suggest.js';

export interface DailyInput {
  config: Config;
  schedule: Schedule;
  today: string;
  numerology: Numerology;
  auction: AuctionIndex;
}

export interface DailyCard {
  embed: Embed;
  /** เลขใน wishlist ที่เปิดวันนี้และจองได้ */
  mine: number;
  /** จำนวนเลขที่ bot เสนอบนการ์ด */
  suggested: number;
}

/** คืนการ์ดของวันนี้ หรือเหตุผลที่ไม่ควรโพสต์ (ไม่ถือเป็น error) */
export function composeDaily(input: DailyInput): DailyCard | { skip: string } {
  const { config: c, schedule: s, today } = input;
  if (isStale(s, today)) return { skip: 'ตารางหมดอายุ — ปล่อยให้ข้อความ 🗓️ ทำงานแทน' };
  const mineEntries = s.entries.filter((e) => e.vehicleType === c.vehicleType);
  const entry = mineEntries.find((e) => e.openDate === today);
  if (!entry) return { skip: 'วันนี้ไม่มีรอบเปิดจองของรถประเภทนี้' };

  const matches = matchSchedule(s.entries, c, input.auction);
  const next = mineEntries.filter((e) => e.openDate > today).sort((a, b) => a.openDate.localeCompare(b.openDate))[0];
  const suggest = suggestNumbers(entry, {
    auction: input.auction, numerology: input.numerology,
    // เลขของตัวเองอยู่ช่องบนแล้ว · เลขที่ไม่อยากได้ไม่ต้องเสนอ
    skip: [...c.wishlist.numbers, ...(c.wishlist.exclude ?? [])],
  });
  const mine = matches.find((m) => m.entry.openDate === today) ?? null;
  return {
    embed: dailyEmbed({
      config: c, entry, today, suggest, mine,
      tomorrow: next ? { entry: next, mine: matches.find((m) => m.entry.openDate === next.openDate)?.numbers.length ?? 0 } : null,
    }),
    mine: mine?.numbers.length ?? 0,
    suggested: suggest.groups.reduce((n, g) => n + g.picks.length, 0),
  };
}
