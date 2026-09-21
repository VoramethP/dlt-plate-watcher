// การ์ดประจำวัน 09:30 + ลบตอน 23:50 (ADR-0007) — DiscordRest ปลอม + store ไฟล์ชั่วคราว ไม่แตะเครือข่าย
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auctionIndex, loadAuctionRules } from '../src/auction.js';
import { resolveConfig } from '../src/config.js';
import { loadNumerology } from '../src/numerology.js';
import { clearDaily, sendDaily, type InteractionDeps } from '../src/notify/interactions.js';
import type { DiscordRest } from '../src/notify/rest.js';
import type { Schedule } from '../src/schedule/types.js';
import { AVOID_GRADE, scoreNumber, suggestNumbers } from '../src/suggest.js';
import { fileStore } from '../src/store.js';

const week: Schedule = {
  sourceFileId: 'F', version: 'v1', fetchedAt: '', entries: [
    { vehicleType: 'car', openDate: '2026-09-21', prefix: '8ขช', from: 1, to: 2500, registerBy: '2026-10-21' },
    { vehicleType: 'car', openDate: '2026-09-22', prefix: '8ขช', from: 2501, to: 5000, registerBy: '2026-10-22' },
    { vehicleType: 'van', openDate: '2026-09-21', prefix: '1นฎ', from: 1, to: 30, registerBy: '2026-10-21' },
  ],
};

function fakeRest() {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  let nextId = 500;
  const rest: DiscordRest = {
    async request(method, path, body) {
      calls.push({ method, path, body });
      if (method === 'POST' && path.endsWith('/messages')) return { id: String(nextId++), author: { id: 'bot' }, type: 0 } as never;
      if (method === 'GET') return [] as never;
      return undefined as never;
    },
  };
  return { rest, calls };
}

async function deps(now = '2026-09-21T02:30:00Z'): Promise<InteractionDeps & { calls: ReturnType<typeof fakeRest>['calls'] }> {
  const dir = await mkdtemp(join(tmpdir(), 'dlt-daily-'));
  const configPath = join(dir, 'watch.config.json');
  await writeFile(configPath, JSON.stringify({
    scheduleFileId: 'x'.repeat(24), vehicleType: 'car',
    wishlist: { numbers: [1115, 8888], patterns: [], digitSums: [] },
  }));
  const store = fileStore({ statePath: join(dir, '.state', 's.json'), configPath });
  const { rest, calls } = fakeRest();
  return {
    rest, store, channelId: 'C', calls, log: () => undefined,
    config: () => resolveConfig({ configPath, store, env: {} }),
    schedule: async () => week,
    numerology: () => loadNumerology(),
    auction: () => loadAuctionRules(),
    now: new Date(now),
  };
}

const posted = (d: { calls: Array<{ method: string; path: string; body?: unknown }> }) =>
  d.calls.filter((c) => c.method === 'POST' && c.path === '/channels/C/messages')
    .map((c) => c.body as { embeds: Array<{ title: string; description: string; fields: Array<{ name: string; value: string }> }>; components: unknown[] });

describe('คัดเลขน่าสนใจ (suggestNumbers)', () => {
  it('ตัดเลขประมูล · ตัดกลุ่มที่ตำราบอกให้เลี่ยง · สายละ 3 เลข ไม่ซ้ำข้ามสาย', async () => {
    const numerology = await loadNumerology();
    const auction = auctionIndex(await loadAuctionRules());
    const entry = week.entries[1];
    const r = suggestNumbers(entry, { numerology, auction, skip: [3456] });
    expect(r.bookable + r.auction).toBe(2500);
    expect(r.auction).toBeGreaterThan(0);

    const picked = r.groups.flatMap((g) => g.picks);
    expect(new Set(picked.map((p) => p.n)).size).toBe(picked.length); // ไม่ซ้ำข้ามสาย
    for (const g of r.groups) expect(g.picks.length).toBeLessThanOrEqual(3);
    for (const p of picked) {
      expect(auction.has(p.n)).toBe(false);
      expect(p.n).not.toBe(3456); // skip
      expect(p.groups.some((g) => g.group.kind === 'avoid')).toBe(false);
      expect(p.n >= entry.from && p.n <= entry.to).toBe(true);
    }
    // คะแนนเรียงจากมากไปน้อยในแต่ละสาย
    for (const g of r.groups) expect(g.picks.map((p) => p.score)).toEqual([...g.picks.map((p) => p.score)].sort((a, b) => b - a));
  });

  it('ผลรวมเกรด "ไม่ดีนัก" ไม่ถูกเสนอ แม้จะเข้าสายมงคลหลายสาย', async () => {
    const numerology = await loadNumerology();
    const bad = Object.entries(numerology.sumGrades).filter(([, v]) => v.grade === AVOID_GRADE).map(([k]) => Number(k));
    expect(bad.length).toBeGreaterThan(0);
    for (const g of suggestNumbers(week.entries[1], { numerology, auction: auctionIndex(await loadAuctionRules()) }).groups) {
      for (const p of g.picks) expect(bad).not.toContain(p.sum);
    }
    // ตรวจตรง ๆ ด้วยเลขที่รู้ว่าผลรวมได้เกรดนั้น
    const sample = [...Array(9999).keys()].map((i) => i + 1).find((n) => bad.includes(scoreNumber('8ขช', n, { ...numerology, sumGrades: {} })?.sum ?? -1));
    if (sample) expect(scoreNumber('8ขช', sample, numerology)).toBeNull();
  });
});

describe('📣 การ์ดประจำวัน', () => {
  it('วันที่มีรอบเปิด → โพสต์ใบเดียวเข้าห้อง + ปุ่ม 🔢 + แผงตามมาล่างสุด + จำ id ไว้ลบ', async () => {
    const d = await deps();
    expect(await sendDaily(d)).toEqual({ posted: true });
    const msgs = posted(d);
    expect(msgs).toHaveLength(2); // การ์ดประจำวัน + แผง
    const card = msgs[0];
    expect(card.embeds[0].title).toContain('📣 เลขน่าสนใจวันนี้');
    expect(card.embeds[0].description).toContain('วันนี้เปิด **8ขช** 1–2500');
    expect(JSON.stringify(card.components)).toContain('add_number'); // ปุ่ม 🔢
    expect(msgs[1].embeds[0].title).toBe('🏠 dlt-plate-watcher');
    expect(await d.store.getMeta('dailyMessageId')).toBe('500');
    const ev = await d.store.recentEvents(5, ['daily']);
    expect(ev[0]).toMatchObject({ kind: 'daily', payload: { date: '2026-09-21', mine: 1 } });
  });

  it('ของคุณมาก่อนของ bot · ปิดท้ายด้วยรอบพรุ่งนี้พร้อมของเตรียม', async () => {
    const d = await deps();
    await sendDaily(d);
    const fields = posted(d)[0].embeds[0].fields;
    expect(fields[0].name).toContain('🎯 เลขในฝันของคุณที่เปิดวันนี้');
    expect(fields[0].value).toContain('`1115`'); // 8888 เป็นเลขประมูล ไม่นับเป็นเลขที่จองได้
    expect(fields[0].value).not.toContain('8888');
    const last = fields.at(-1)!;
    expect(last.name).toBe('🔜 พรุ่งนี้');
    expect(last.value).toContain('เปิด **8ขช** 2501–5000');
    expect(last.value).toContain('ThaID');
  });

  it('วันสุดท้ายของตาราง → บอกว่ารอตารางรอบใหม่เช้าจันทร์', async () => {
    const d = await deps('2026-09-22T02:30:00Z');
    await sendDaily(d);
    expect(posted(d)[0].embeds[0].fields.at(-1)!.value).toContain('ตารางรอบใหม่ออกเช้าวันจันทร์');
  });

  it('วันที่ไม่มีรอบเปิดของรถประเภทนี้ (เสาร์-อาทิตย์) → ไม่โพสต์อะไรเลย', async () => {
    const d = await deps('2026-09-26T02:30:00Z');
    expect((await sendDaily(d)).posted).toBe(false);
    expect(posted(d)).toHaveLength(0);
  });

  it('ตารางหมดอายุ → ไม่โพสต์ ปล่อยให้ข้อความ 🗓️ ทำงานแทน', async () => {
    const d = await deps('2026-10-01T02:30:00Z');
    const r = await sendDaily(d);
    expect(r.posted).toBe(false);
    expect(r.reason).toContain('ตารางหมดอายุ');
    expect(posted(d)).toHaveLength(0);
  });

  it('ใบเมื่อวานยังค้างอยู่ → ลบก่อนโพสต์ใบใหม่ ไม่ให้ซ้อน', async () => {
    const d = await deps();
    await d.store.setMeta('dailyMessageId', '499');
    await sendDaily(d);
    expect(d.calls.some((c) => c.method === 'DELETE' && c.path === '/channels/C/messages/499')).toBe(true);
  });

  it('23:50 ลบการ์ดประจำวัน · ไม่มีใบค้าง = ไม่ทำอะไร ไม่ error', async () => {
    const d = await deps();
    expect(await clearDaily(d)).toEqual({ deleted: false });
    await sendDaily(d);
    expect(await clearDaily(d)).toEqual({ deleted: true });
    expect(d.calls.some((c) => c.method === 'DELETE' && c.path === '/channels/C/messages/500')).toBe(true);
    expect(await d.store.getMeta('dailyMessageId')).toBe('');
    expect((await d.store.recentEvents(1, ['daily']))[0].payload).toMatchObject({ cleared: true });
  });
});
