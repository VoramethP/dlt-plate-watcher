// เลขที่ "จองได้แล้ว" + เตือนก่อนหมดเขตจดทะเบียน (ADR-0008) — ไม่แตะเครือข่าย
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { EMPTY_AUCTION } from '../src/auction.js';
import { EMPTY_NUMEROLOGY } from '../src/numerology.js';
import { BUTTON, WON_MODAL, WON_TEXT, DISCORD_LIMITS } from '../src/notify/actions.js';
import { handleInteraction, InteractionType, ResponseType, type Interaction, type InteractionDeps } from '../src/notify/interactions.js';
import type { DiscordRest } from '../src/notify/rest.js';
import type { Schedule } from '../src/schedule/types.js';
import { fileStore, HISTORY_KINDS } from '../src/store.js';
import { applyWonChange, loadWon, parseDeadline, plateText } from '../src/won.js';

const week: Schedule = {
  sourceFileId: 'F', version: 'v1', fetchedAt: '', entries: [
    { vehicleType: 'car', openDate: '2026-09-24', prefix: '8ขช', from: 5001, to: 7500, registerBy: '2026-10-26' },
    { vehicleType: 'car', openDate: '2026-09-25', prefix: '8ขช', from: 7501, to: 9999, registerBy: '2026-10-26' },
  ],
};
const entries = week.entries.map(({ prefix, from, to, registerBy }) => ({ prefix, from, to, registerBy }));

describe('อ่านวันที่ที่คนไทยพิมพ์จริง', () => {
  it('รับทั้ง พ.ศ. / ค.ศ. / ISO / ชื่อเดือนไทย', () => {
    for (const text of ['26/10/2569', '26-10-2569', '26/10/2026', '2026-10-26', '26 ตุลาคม 2569']) {
      expect(parseDeadline(text)).toBe('2026-10-26');
    }
  });
  it('อ่านไม่ออกคืน null ไม่เดามั่ว', () => {
    for (const text of ['', 'พรุ่งนี้', '31/02/2569', '13/13/2569', '2026-13-01']) expect(parseDeadline(text)).toBeNull();
  });
});

describe('applyWonChange', () => {
  const base = { remove: [], by: 'Hope', now: '2026-09-24T03:00:00.000Z', entries };

  it('เลขอยู่ในตารางสัปดาห์นี้ → เดาหมวดกับวันหมดเขตให้เอง', () => {
    const c = applyWonChange([], { ...base, numbers: [5456] });
    expect(c.added).toEqual([{ prefix: '8ขช', number: 5456, registerBy: '2026-10-26', by: 'Hope', at: base.now }]);
    expect(c.changed).toBe(true);
    expect(plateText(c.added[0])).toBe('8ขช 5456');
  });

  it('เลขนอกตาราง (จองไว้นานแล้ว) → บอกให้พิมพ์หมวด+วันเอง ไม่บันทึกมั่ว', () => {
    const c = applyWonChange([], { ...base, numbers: [1234] });
    expect(c.needDate).toEqual([1234]);
    expect(c.list).toHaveLength(0);
    expect(c.changed).toBe(false);
  });

  it('พิมพ์หมวด/วันเองได้ ทับค่าที่เดาจากตาราง', () => {
    const c = applyWonChange([], { ...base, numbers: [1234], prefix: '8กก', registerBy: '2026-12-01' });
    expect(c.added[0]).toMatchObject({ prefix: '8กก', number: 1234, registerBy: '2026-12-01' });
  });

  it('บันทึกซ้ำ = เขียนทับ ไม่มีรายการซ้ำ · เรียงตามวันหมดเขต', () => {
    const first = applyWonChange([], { ...base, numbers: [5456] }).list;
    const c = applyWonChange(first, { ...base, numbers: [5456, 7777], prefix: '8ขช', registerBy: '2026-10-01' });
    expect(c.replaced.map((w) => w.number)).toEqual([5456]);
    expect(c.list.map((w) => w.number)).toEqual([5456, 7777]); // 1 ต.ค. มาก่อน
    expect(c.list).toHaveLength(2);
  });

  it('ช่องเอาออก: จดทะเบียนแล้วหยุดเตือน · ไม่มีในรายการก็บอก', () => {
    const list = applyWonChange([], { ...base, numbers: [5456] }).list;
    const c = applyWonChange(list, { ...base, numbers: [], remove: [5456, 1111] });
    expect(c.removed.map((w) => w.number)).toEqual([5456]);
    expect(c.notFound).toEqual([1111]);
    expect(c.list).toHaveLength(0);
    expect(c.changed).toBe(true);
  });
});

function fakeRest() {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const rest: DiscordRest = {
    async request(method, path, body) {
      calls.push({ method, path, body });
      if (method === 'POST' && path.endsWith('/messages')) return { id: '900', author: { id: 'bot' }, type: 0 } as never;
      if (method === 'GET') return [] as never;
      return undefined as never;
    },
  };
  return { rest, calls };
}

async function deps(): Promise<InteractionDeps & { patched: () => Array<{ content?: string; embeds?: Array<{ fields: Array<{ name: string; value: string }> }> }> }> {
  const dir = await mkdtemp(join(tmpdir(), 'dlt-won-'));
  const configPath = join(dir, 'watch.config.json');
  await writeFile(configPath, JSON.stringify({
    scheduleFileId: 'x'.repeat(24), vehicleType: 'car',
    wishlist: { numbers: [5456], patterns: [], digitSums: [] },
    reminders: { daysBeforeRegisterDeadline: [7, 1] },
  }));
  const store = fileStore({ statePath: join(dir, '.state', 's.json'), configPath });
  const { rest, calls } = fakeRest();
  return {
    rest, store, channelId: 'C', log: () => undefined,
    config: () => resolveConfig({ configPath, store, env: {} }),
    schedule: async () => week,
    numerology: async () => EMPTY_NUMEROLOGY,
    auction: async () => EMPTY_AUCTION,
    now: new Date('2026-09-24T07:00:00Z'),
    patched: () => calls.filter((c) => c.method === 'PATCH').map((c) => c.body as never),
  };
}

const user = { id: 'u1', username: 'hope', global_name: 'Hope' };
const base = { id: 'i1', application_id: 'app', token: 'tok', channel_id: 'C', member: { user } };
const press = (custom_id: string): Interaction => ({ ...base, type: InteractionType.MESSAGE_COMPONENT, data: { custom_id }, message: { id: 'm', author: { id: 'bot' } } });
const submit = (fields: Record<string, string>): Interaction => ({
  ...base, type: InteractionType.MODAL_SUBMIT,
  data: { custom_id: WON_MODAL.id, components: Object.entries(fields).map(([custom_id, value]) => ({ components: [{ custom_id, value }] })) },
});
const run = async (d: InteractionDeps, i: Interaction) => { const r = await handleInteraction(i, d); await r.work?.(); return r.response; };

describe('ปุ่ม 🏆 จองได้แล้ว', () => {
  it('กดแล้วได้ modal 4 ช่อง · ข้อความอยู่ในลิมิต Discord', async () => {
    const d = await deps();
    const r = await handleInteraction(press(BUTTON.wonNumber), d);
    expect(r.response).toMatchObject({ type: ResponseType.MODAL, data: { custom_id: WON_MODAL.id } });
    expect((r.response.data as { components: unknown[] }).components).toHaveLength(4);
    expect(WON_TEXT.title.length).toBeLessThanOrEqual(DISCORD_LIMITS.modalTitle);
    for (const [k, v] of Object.entries(WON_TEXT)) {
      if (k.endsWith('Label')) expect(v.length, k).toBeLessThanOrEqual(DISCORD_LIMITS.inputLabel);
      if (k.endsWith('Placeholder')) expect(v.length, k).toBeLessThanOrEqual(DISCORD_LIMITS.placeholder);
    }
  });

  it('ใส่แค่เลข → บันทึกพร้อมหมวด/วันหมดเขตจากตาราง + บอกว่าจะเตือนวันไหน + ลง events', async () => {
    const d = await deps();
    await run(d, submit({ [WON_MODAL.number]: '5456', [WON_MODAL.deadline]: '', [WON_MODAL.prefix]: '', [WON_MODAL.remove]: '' }));
    const text = d.patched().at(-1)!.content!;
    expect(text).toContain('🏆 **8ขช 5456** บันทึกแล้ว');
    expect(text).toContain('จันทร์ 26 ตุลาคม 2569');
    expect(text).toContain('จะเตือนในห้องเมื่อเหลือ 7 และ 1 วัน');
    expect(await loadWon(d.store)).toEqual([{ prefix: '8ขช', number: 5456, registerBy: '2026-10-26', by: 'Hope', at: '2026-09-24T07:00:00.000Z' }]);
    expect((await d.store.recentEvents(1, HISTORY_KINDS))[0]).toMatchObject({ kind: 'won', actor: { name: 'Hope' }, payload: { added: [5456] } });
  });

  it('วันที่อ่านไม่ออก → บอกรูปแบบที่รับ ไม่บันทึกอะไร', async () => {
    const d = await deps();
    await run(d, submit({ [WON_MODAL.number]: '5456', [WON_MODAL.deadline]: 'พรุ่งนี้', [WON_MODAL.prefix]: '', [WON_MODAL.remove]: '' }));
    expect(d.patched().at(-1)!.content).toContain('อ่านวันที่ "พรุ่งนี้" ไม่ออก');
    expect(await loadWon(d.store)).toEqual([]);
  });

  it('ช่องเอาออก → หยุดเตือน · 📋 แสดงช่อง 🏆 ตอนมีรายการ', async () => {
    const d = await deps();
    await run(d, submit({ [WON_MODAL.number]: '5456', [WON_MODAL.deadline]: '', [WON_MODAL.prefix]: '', [WON_MODAL.remove]: '' }));
    await run(d, press(BUTTON.showWishlist));
    const fields = d.patched().at(-1)!.embeds![0].fields;
    const won = fields.find((f) => f.name.startsWith('🏆'))!;
    expect(won.name).toBe('🏆 จองได้แล้ว (1)');
    expect(won.value).toContain('`8ขช 5456`');
    expect(won.value).toContain('อีก 32 วัน');

    await run(d, submit({ [WON_MODAL.number]: '', [WON_MODAL.deadline]: '', [WON_MODAL.prefix]: '', [WON_MODAL.remove]: '5456' }));
    expect(d.patched().at(-1)!.content).toContain('✅ **8ขช 5456** เอาออกจากรายการแล้ว');
    expect(await loadWon(d.store)).toEqual([]);
  });
});
