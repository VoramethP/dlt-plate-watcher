import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileStore, HISTORY_KINDS } from '../src/store.js';
import { resolveConfig } from '../src/config.js';

async function tmp() {
  const dir = await mkdtemp(join(tmpdir(), 'dlt-store-'));
  const configPath = join(dir, 'watch.config.json');
  await writeFile(configPath, JSON.stringify({ scheduleFileId: 'x'.repeat(24), vehicleType: 'car', wishlist: { numbers: [9999], patterns: [], digitSums: [] } }, null, 2));
  return { dir, configPath, store: fileStore({ statePath: join(dir, '.state', 'notified.json'), configPath }) };
}

describe('fileStore — โหมดรันบนเครื่อง', () => {
  it('appendNotified ต่อท้ายและจำเวอร์ชันตาราง', async () => {
    const { store } = await tmp();
    await store.appendNotified(['a', 'b'], 'v1');
    await store.appendNotified(['c']);
    expect(await store.loadState()).toMatchObject({ notified: ['a', 'b', 'c'], lastScheduleVersion: 'v1' });
  });
  it('saveWishlist เขียน watch.config.json + จำเจ้าของคนแรก และคืน owners ก่อนแก้', async () => {
    const { store, configPath } = await tmp();
    const somchai = { id: '1', name: 'somchai' }; const nok = { id: '2', name: 'nok' };
    expect(await store.saveWishlist({ numbers: [5555, 9999], exclude: [], added: [5555], excluded: [], removed: [] }, somchai)).toEqual({});
    const before = await store.saveWishlist({ numbers: [5555, 6000, 9999], exclude: [4444], added: [5555, 6000], excluded: [4444], removed: [] }, nok);
    expect(before).toEqual({ 5555: 'somchai' });
    expect((await store.loadState()).owners).toEqual({ 5555: 'somchai', 6000: 'nok' });
    expect(JSON.parse(await readFile(configPath, 'utf8')).wishlist).toMatchObject({ numbers: [5555, 6000, 9999], exclude: [4444] });
    await store.saveWishlist({ numbers: [6000, 9999], exclude: [4444], added: [], excluded: [], removed: [5555] }, nok);
    expect((await store.loadState()).owners).toEqual({ 6000: 'nok' });
    expect(await store.loadWishlist()).toEqual({ numbers: [6000, 9999], exclude: [4444] });
  });
  it('meta และ events (jsonl) — ล่าสุดก่อน กรองชนิดได้', async () => {
    const { store } = await tmp();
    expect(await store.getMeta('panelMessageId')).toBeUndefined();
    await store.setMeta('panelMessageId', '123');
    expect(await store.getMeta('panelMessageId')).toBe('123');
    await store.logEvent({ kind: 'check', payload: { sent: 0 } });
    await store.logEvent({ kind: 'notify', payload: { key: 'stale:F' } });
    await store.logEvent({ kind: 'wishlist', actor: { id: '1', name: 'nok' }, payload: { added: [1] } });
    const recent = await store.recentEvents(10, HISTORY_KINDS);
    expect(recent.map((e) => e.kind)).toEqual(['wishlist', 'notify']); // check ไม่โชว์ใน 📜
    expect(recent[0].at).toMatch(/^\d{4}-/);
    expect((await store.recentEvents(1)).map((e) => e.kind)).toEqual(['wishlist']);
  });
});

describe('resolveConfig — ฐานจาก env หรือไฟล์ + wishlist จาก store', () => {
  it('WATCH_CONFIG_JSON ชนะไฟล์ แต่ numbers/exclude มาจาก store เสมอ', async () => {
    const { store, configPath } = await tmp();
    await store.saveWishlist({ numbers: [1234], exclude: [7], added: [1234], excluded: [7], removed: [] }, { id: '1', name: 'nok' });
    const envJson = JSON.stringify({ scheduleFileId: 'y'.repeat(24), vehicleType: 'van', wishlist: { numbers: [1], patterns: ['^9+$'] } });
    const c = await resolveConfig({ configPath, store, env: { WATCH_CONFIG_JSON: envJson } });
    expect(c.vehicleType).toBe('van');
    expect(c.wishlist).toMatchObject({ numbers: [1234], exclude: [7], patterns: [{ name: '^9+$', regex: '^9+$' }] });
    const fromFile = await resolveConfig({ configPath, store, env: {} });
    expect(fromFile.vehicleType).toBe('car');
    expect(fromFile.wishlist.numbers).toEqual([1234]);
  });
  it('env ที่ไม่ใช่ JSON → error บอกชื่อ env', async () => {
    const { store, configPath } = await tmp();
    await expect(resolveConfig({ configPath, store, env: { WATCH_CONFIG_JSON: '{oops' } })).rejects.toThrow('WATCH_CONFIG_JSON');
  });
});
