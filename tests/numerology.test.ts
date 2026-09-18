import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adjacentPairs, bestSumNumbers, groupNumbersByMeaning, loadNumerology, meaningLine, meaningOf, plateSum } from '../src/numerology.js';
import { matchEmbed } from '../src/notify/discord.js';
import { matchEntry } from '../src/match.js';

const table = {
  sources: [{ id: 'a', name: 'A', url: 'x' }, { id: 'b', name: 'B', url: 'y' }],
  includePrefix: true,
  letterValues: { ข: 2, ฉ: 5 },
  sumGrades: { '35': { grade: 'ดีมาก', sources: ['a', 'b'], meaning: 'ทดสอบ' }, '20': { grade: 'ไม่ดีนัก', sources: ['a'], conflict: { ดี: ['a'] } } },
  groups: [
    { emoji: '💰', name: 'การเงิน', kind: 'good' as const, sums: [], pairs: ['56'], pairSources: { '56': ['a', 'b'] } },
    { emoji: '🙏', name: 'เมตตา', kind: 'good' as const, sums: [], pairs: ['15', '51'], pairSources: { '15': ['a'] } },
    { emoji: '⚠️', name: 'ควรเลี่ยง', kind: 'avoid' as const, sums: [], pairs: ['13'], pairSources: { '13': ['a', 'b'] } },
  ],
};

describe('เลขศาสตร์', () => {
  it('plateSum นับหมวดด้วยเมื่อ includePrefix', () => {
    expect(plateSum('8ขฉ', 5555, table)).toBe(8 + 2 + 5 + 20);
    expect(plateSum('8ขฉ', 5555, { ...table, includePrefix: false })).toBe(20);
  });
  it('adjacentPairs', () => expect(adjacentPairs(2456)).toEqual(['24', '45', '56']));
  it('meaningOf: กลุ่มจากคู่เลข + จำนวนแหล่ง + เกรดผลรวม', () => {
    const m = meaningOf('8ขฉ', 1556, table); // ผลรวม 32 · คู่ 15, 55, 56
    expect(m.groups.map((g) => [g.group.name, g.votes])).toEqual([['การเงิน', 2], ['เมตตา', 1]]);
    expect(m.sumGrade).toBeUndefined();
    expect(meaningOf('8ขฉ', 5555, table).sumGrade).toMatchObject({ grade: 'ดีมาก', sources: ['a', 'b'] });
  });
  it('meaningLine อ่านง่ายและบอกจำนวนแหล่ง', () => {
    expect(meaningLine('8ขฉ', 5555, table)).toBe('ผลรวม 35 = ดีมาก · ทดสอบ · 2 แหล่งตรงกัน');
    expect(meaningLine('8ขฉ', 1556, table)).toBe('💰 การเงิน (คู่เลข 56 · 2 แหล่งตรงกัน) / 🙏 เมตตา (คู่เลข 15 · 1 แหล่ง) / ผลรวม 32 ไม่อยู่ในตาราง');
    expect(meaningLine('8ขฉ', 1234, { ...table, groups: [], sumGrades: {} })).toBe('');
  });
  it('groupNumbersByMeaning: กลุ่มควรเลี่ยงไปท้ายสุด', () => {
    const g = groupNumbersByMeaning('8ขฉ', [1313, 5656], table);
    expect(g.map((x) => x.group.name)).toEqual(['การเงิน', 'ควรเลี่ยง']);
  });
  it('bestSumNumbers เฉพาะผลรวมดีมาก', () => {
    expect(bestSumNumbers('8ขฉ', [5555, 5000], table)).toEqual([{ n: 5555, sum: 35 }]);
  });
  it('matchEmbed ใส่ field 🔮 เฉพาะเมื่อมีตารางและมีอะไรจะบอก', () => {
    const entry = { vehicleType: 'car' as const, openDate: '2026-09-18', prefix: '8ขฉ', from: 5001, to: 6500, registerBy: '2026-10-18' };
    const m = matchEntry(entry, { numbers: [5555, 5656], patterns: [], digitSums: [], exclude: [] })!;
    expect(JSON.stringify(matchEmbed(m))).not.toContain('🔮');
    const json = JSON.stringify(matchEmbed(m, table));
    expect(json).toContain('🔮 เลขศาสตร์ (รวบรวมจาก 2 แหล่ง');
    expect(json).toContain('⭐ **ผลรวมทั้งป้ายระดับดีมาก**');
    expect(json).toContain('💰 **การเงิน**');
  });
  it('numerology.json จริง: อ่านได้ มีแหล่งอ้างอิง และตารางตัวอักษรตรงกับแหล่ง', async () => {
    const real = await loadNumerology('numerology.json');
    expect(real.sources.length).toBe(6);
    expect(real.groups.length).toBe(5);
    expect(real.letterValues['ก']).toBe(1); expect(real.letterValues['ต']).toBe(3); expect(real.letterValues['ฐ']).toBe(9);
    expect(real.sumGrades['24']).toMatchObject({ grade: 'ดีมาก', sources: ['sanook', 'autospinn-sum'] });
    expect(real.sumGrades['20'].conflict).toBeDefined();
    expect(real.groups.find((g) => g.kind === 'avoid')?.pairs).toContain('13');
    for (const g of real.groups) for (const p of g.pairs) expect(g.pairSources[p]?.length).toBeGreaterThan(0);
  });
  it('loadNumerology: ไม่มีไฟล์ → ว่าง · ไฟล์เพี้ยน → error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dlt-'));
    expect((await loadNumerology(join(dir, 'none.json'))).groups).toEqual([]);
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ groups: [{ name: '', pairs: ['abc'] }] }));
    await expect(loadNumerology(join(dir, 'bad.json'))).rejects.toThrow('ไม่ถูกต้อง');
  });
});
