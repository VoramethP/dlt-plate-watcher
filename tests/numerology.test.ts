import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adjacentPairs, groupNumbersByMeaning, loadNumerology, meaningLine, meaningOf, plateSum } from '../src/numerology.js';
import { matchEmbed } from '../src/notify/discord.js';
import { matchEntry } from '../src/match.js';

const table = {
  includePrefix: true,
  letterValues: { ข: 2, ฉ: 5 },
  groups: [
    { emoji: '💰', name: 'สายการเงิน', sums: [35], pairs: ['56'] },
    { emoji: '🙏', name: 'สายเมตตา', sums: [15], pairs: ['15', '51'] },
  ],
};

describe('เลขศาสตร์', () => {
  it('plateSum นับหมวดด้วยเมื่อ includePrefix', () => {
    expect(plateSum('8ขฉ', 5555, table)).toBe(8 + 2 + 5 + 20);
    expect(plateSum('8ขฉ', 5555, { ...table, includePrefix: false })).toBe(20);
  });
  it('adjacentPairs', () => expect(adjacentPairs(2456)).toEqual(['24', '45', '56']));
  it('meaningOf เข้าได้หลายสาย และบอกเหตุผล', () => {
    const m = meaningOf('8ขฉ', 5555, table); // ผลรวม 35
    expect(m.sum).toBe(35);
    expect(m.groups.map((g) => g.group.name)).toEqual(['สายการเงิน']);
    expect(m.groups[0].via).toEqual(['ผลรวม 35']);
    const both = meaningOf('8ขฉ', 1556, table); // ผลรวม 8+2+5+17=32 ไม่เข้า · คู่ 15 → เมตตา · คู่ 56 → การเงิน
    expect(both.groups.map((g) => g.group.name)).toEqual(['สายการเงิน', 'สายเมตตา']);
    expect(meaningLine('8ขฉ', 1234, table)).toBe('');
    expect(meaningLine('8ขฉ', 5555, table)).toBe('💰 สายการเงิน (ผลรวม 35)');
  });
  it('groupNumbersByMeaning จัดกลุ่มตามสาย', () => {
    const g = groupNumbersByMeaning('8ขฉ', [5555, 1556, 1234], table);
    expect(g.map((x) => [x.group.name, x.numbers])).toEqual([['สายการเงิน', [5555, 1556]], ['สายเมตตา', [1556]]]);
  });
  it('matchEmbed ใส่ field 🔮 เฉพาะเมื่อมีตารางและมีเลขเข้าสาย', () => {
    const entry = { vehicleType: 'car' as const, openDate: '2026-09-18', prefix: '8ขฉ', from: 5001, to: 6500, registerBy: '2026-10-18' };
    const m = matchEntry(entry, { numbers: [5555, 6000], patterns: [], digitSums: [], exclude: [] })!;
    expect(JSON.stringify(matchEmbed(m))).not.toContain('🔮');
    const json = JSON.stringify(matchEmbed(m, table));
    expect(json).toContain('🔮 ความหมาย');
    expect(json).toContain('💰 **สายการเงิน**');
  });
  it('loadNumerology: ไม่มีไฟล์ → ว่าง · ไฟล์จริงในโปรเจกต์อ่านได้และมี 3 สาย', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dlt-'));
    expect((await loadNumerology(join(dir, 'none.json'))).groups).toEqual([]);
    const real = await loadNumerology('numerology.json');
    expect(real.groups.length).toBeGreaterThanOrEqual(3);
    expect(real.letterValues['ข']).toBe(2);
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ groups: [{ name: '', pairs: ['abc'] }] }));
    await expect(loadNumerology(join(dir, 'bad.json'))).rejects.toThrow('ไม่ถูกต้อง');
  });
});
