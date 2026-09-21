// route ปุ่ม/modal/slash แบบ HTTP — ใช้ DiscordRest ปลอมที่จดทุก request และ store ไฟล์ชั่วคราว ไม่แตะเครือข่าย
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { BUTTON, COMMAND, MODAL } from '../src/notify/actions.js';
import { EMPTY_AUCTION } from '../src/auction.js';
import { EMPTY_NUMEROLOGY } from '../src/numerology.js';
import { handleInteraction, InteractionType, ResponseType, sendPanel, type Interaction, type InteractionDeps } from '../src/notify/interactions.js';
import type { DiscordRest } from '../src/notify/rest.js';
import type { Schedule } from '../src/schedule/types.js';
import { fileStore, HISTORY_KINDS } from '../src/store.js';

const schedule: Schedule = {
  sourceFileId: 'F', version: 'v1', fetchedAt: '', entries: [
    { vehicleType: 'car', openDate: '2026-09-18', prefix: '8ขฉ', from: 5001, to: 6500, registerBy: '2026-10-18' },
    { vehicleType: 'car', openDate: '2026-09-21', prefix: '8ขช', from: 1, to: 1500, registerBy: '2026-10-21' },
  ],
};

function fakeRest() {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  let nextId = 100;
  const rest: DiscordRest = {
    async request(method, path, body) {
      calls.push({ method, path, body });
      if (method === 'POST' && path.endsWith('/messages')) return { id: String(nextId++), author: { id: 'bot' }, type: 0 } as never;
      if (method === 'GET' && path.includes('/messages?limit=100')) {
        // ข้อความ 3 อันของ bot (snowflake ใหม่ = ยังไม่ถึง 14 วัน) + 1 ของคนอื่น + อันที่กด
        const fresh = String((BigInt(Date.now() - 1420070400000) << 22n));
        return [{ id: 'keep', author: { id: 'bot' }, type: 0 }, { id: fresh, author: { id: 'bot' }, type: 0 }, { id: String(BigInt(fresh) + 1n), author: { id: 'bot' }, type: 0 }, { id: '7', author: { id: 'human' }, type: 0 }] as never;
      }
      if (method === 'GET') return [] as never;
      return undefined as never;
    },
  };
  return { rest, calls, patched: () => calls.filter((c) => c.method === 'PATCH').map((c) => c.body as { content?: string; embeds?: Array<{ title: string }> }) };
}

async function deps(): Promise<InteractionDeps & { calls: ReturnType<typeof fakeRest>['calls']; patched: ReturnType<typeof fakeRest>['patched'] }> {
  const dir = await mkdtemp(join(tmpdir(), 'dlt-ix-'));
  const configPath = join(dir, 'watch.config.json');
  await writeFile(configPath, JSON.stringify({ scheduleFileId: 'x'.repeat(24), vehicleType: 'car', wishlist: { numbers: [5555], patterns: [{ name: 'ตอง', regex: '^(\\d)\\1{2,3}$' }], digitSums: [] } }));
  const store = fileStore({ statePath: join(dir, '.state', 's.json'), configPath });
  const { rest, calls, patched } = fakeRest();
  return {
    rest, store, channelId: 'C', calls, patched, log: () => undefined,
    config: () => resolveConfig({ configPath, store, env: {} }),
    schedule: async () => schedule,
    numerology: async () => EMPTY_NUMEROLOGY,
    auction: async () => EMPTY_AUCTION, // เทสส่วนใหญ่ไม่เกี่ยวกับเลขประมูล — เทสที่เกี่ยวโหลดกฎจริงเอง

    now: new Date('2026-09-15T03:00:00Z'),
  };
}

const nok = { id: 'u1', username: 'nok', global_name: 'Nok' };
const base = { id: 'i1', application_id: 'app', token: 'tok', channel_id: 'C', member: { user: nok } };
const button = (custom_id: string, extra: Partial<Interaction> = {}): Interaction => ({ ...base, type: InteractionType.MESSAGE_COMPONENT, data: { custom_id }, message: { id: 'keep', author: { id: 'bot' } }, ...extra });
const run = async (d: InteractionDeps, i: Interaction) => { const r = await handleInteraction(i, d); await r.work?.(); return r.response; };

describe('Interactions Endpoint', () => {
  it('PING → PONG โดยไม่แตะอะไร', async () => {
    const d = await deps();
    expect((await handleInteraction({ ...base, type: InteractionType.PING }, d)).response).toEqual({ type: ResponseType.PONG });
    expect(d.calls).toHaveLength(0);
  });

  it('ปุ่มที่ต้องโหลดตาราง → ตอบ deferred ทันที แล้ว PATCH @original ทีหลัง', async () => {
    const d = await deps();
    const r = await handleInteraction(button(COMMAND.schedule), d);
    expect(r.response).toMatchObject({ type: ResponseType.DEFERRED_CHANNEL_MESSAGE, data: { flags: 64 } });
    expect(d.calls).toHaveLength(0); // ยังไม่ทำอะไรก่อน work()
    await r.work!();
    expect(d.calls[0]).toMatchObject({ method: 'PATCH', path: '/webhooks/app/tok/messages/@original' });
    expect(d.patched()[0].embeds?.[0].title).toContain('ตารางเปิดจองสัปดาห์นี้');
  });

  it('❓ คู่มือ และ 📤 แชร์ ตอบจบในตัว (ไม่ deferred)', async () => {
    const d = await deps();
    const guide = await handleInteraction(button(COMMAND.guide), d);
    expect(guide.response).toMatchObject({ type: ResponseType.CHANNEL_MESSAGE });
    expect(guide.work).toBeUndefined();
    const share = await handleInteraction(button(BUTTON.share, { message: { id: 'm', author: { id: 'bot' }, embeds: [{ title: '🎯 หัว', fields: [{ name: 'ตอง (1)', value: '`5555`' }] }] } }), d);
    expect(JSON.stringify(share.response)).toContain('ตอง (1): 5555');
  });

  it('🔢 เปิด modal 4 ช่อง · ส่ง modal → แก้ wishlist ผ่าน store + ลง events + ตอบรายเลข', async () => {
    const d = await deps();
    const modal = await handleInteraction(button(BUTTON.addNumber), d);
    expect(modal.response).toMatchObject({ type: ResponseType.MODAL, data: { custom_id: MODAL.addNumber } });
    expect((modal.response.data as { components: unknown[] }).components).toHaveLength(4);

    const submit: Interaction = { ...base, type: InteractionType.MODAL_SUBMIT, data: { custom_id: MODAL.addNumber, components: [
      { components: [{ custom_id: MODAL.field, value: '6464, 5555 abc' }] },
      { components: [{ custom_id: MODAL.excludeField, value: '4444' }] },
      { components: [{ custom_id: MODAL.auctionField, value: '' }] },
      { components: [{ custom_id: MODAL.removeField, value: '' }] },
    ] } };
    await run(d, submit);
    const text = d.patched()[0].content!;
    expect(text).toContain('✅ **6464** เพิ่มแล้ว');
    expect(text).toContain('ℹ️ **5555** อยู่ใน wishlist อยู่แล้ว');
    expect(text).toContain('🚫 **4444**');
    expect(text).toContain('❌ "abc"');
    expect(await d.store.loadWishlist()).toEqual({ numbers: [5555, 6464], exclude: [4444], auction: [] });
    expect((await d.store.loadState()).owners).toEqual({ 6464: 'Nok' });
    const ev = await d.store.recentEvents(5, HISTORY_KINDS);
    expect(ev[0]).toMatchObject({ kind: 'wishlist', actor: { id: 'u1', name: 'Nok' }, payload: { added: [6464], excluded: [4444] } });
  });

  it('📜 ประวัติ อ่านจาก events · 🧹 ลบเฉพาะข้อความของ bot แล้วโพสต์แผงใหม่', async () => {
    const d = await deps();
    await d.store.logEvent({ kind: 'notify', payload: { key: 'stale:F' } });
    await run(d, button(BUTTON.showHistory));
    expect(d.patched()[0].content).toContain('🗓️ ตารางหมดอายุ');

    await run(d, button(BUTTON.clearHistory));
    const bulk = d.calls.find((c) => c.path.endsWith('/bulk-delete'));
    expect((bulk?.body as { messages: string[] }).messages).toHaveLength(2); // ไม่รวม keep และไม่รวมของ human
    expect(d.calls.some((c) => c.method === 'POST' && c.path === '/channels/C/messages')).toBe(true); // แผงใหม่
    expect(d.patched().at(-1)?.content).toContain('ลบข้อความเก่าของ bot ไป 2 ข้อความ');
    expect((await d.store.recentEvents(1, ['clear']))[0].payload).toEqual({ deleted: 2 });
  });

  it('sendPanel ลบแผงเก่าจาก meta · จำ id ใหม่ · ปักหมุด', async () => {
    const d = await deps();
    await d.store.setMeta('panelMessageId', '55');
    await sendPanel(d);
    expect(d.calls.map((c) => `${c.method} ${c.path}`)).toEqual(expect.arrayContaining(['DELETE /channels/C/messages/55', 'POST /channels/C/messages', 'PUT /channels/C/pins/100']));
    expect(await d.store.getMeta('panelMessageId')).toBe('100');
    const panel = d.calls.find((c) => c.method === 'POST')!.body as { embeds: Array<{ description: string }>; components: unknown[] };
    expect(panel.embeds[0].description).toContain('⏳ เลขในฝันเปิดครั้งถัดไป');
    expect(panel.components).toHaveLength(2);
  });

  it('/panel → deferred แล้วโพสต์แผง · 🔄 เช็คตอนนี้ → ส่งแจ้งเตือน + แผงตาม + events actor เป็นคนกด', async () => {
    const d = await deps();
    await run(d, { ...base, type: InteractionType.APPLICATION_COMMAND, data: { name: 'panel' } });
    expect(d.patched()[0].content).toContain('ย้ายแผงควบคุม');

    await run(d, button(COMMAND.check));
    expect(d.patched().at(-1)?.content).toMatch(/🔄 เช็คแล้ว · ควรแจ้ง \d+ · ส่งใหม่ \d+/);
    const check = (await d.store.recentEvents(1, ['check']))[0];
    expect(check.actor).toEqual({ id: 'u1', name: 'Nok' });
  });

  it('งานหลังตอบพัง → PATCH ข้อความ error ให้คนกดเห็น ไม่โยนออกมา', async () => {
    const d = await deps();
    d.schedule = async () => { throw new Error('Drive ล่ม'); };
    await run(d, button(COMMAND.match));
    expect(d.patched()[0].content).toContain('❌ bot พลาด: Drive ล่ม');
  });
});

import { redactPath } from '../src/notify/rest.js';
describe('ข้อความ error ไม่รั่ว token ของ interaction', () => {
  it('redactPath ปิดส่วน /webhooks/<app>/<token>', () => {
    expect(redactPath('/webhooks/155050641/aW50ZXJhY3Rpb246MTU1/messages/@original')).toBe('/webhooks/***/messages/@original');
    expect(redactPath('/channels/1/messages')).toBe('/channels/1/messages');
  });
});

// 21 ก.ย. 2569: ขนส่งออกตารางใหม่ 5 วัน → embed รวมกัน 6230 ตัวอักษร → Discord ตอบ 400 MAX_EMBED_SIZE_EXCEEDED
// ทั้งแจ้งเตือนในช่อง (POST /channels) และคำตอบ ephemeral (PATCH @original) ต้องแยกข้อความเอง
describe('embed ยาวเกิน 6000 ตัวอักษรต่อข้อความ', () => {
  const week: Schedule = {
    sourceFileId: 'F', version: 'v2', fetchedAt: '', entries: ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'].map((openDate, i) => ({
      vehicleType: 'car' as const, openDate, prefix: '8ขช', from: i * 2000 + 1, to: (i + 1) * 2000, registerBy: '2026-10-21',
    })),
  };
  const wide = async (d: InteractionDeps) => {
    d.schedule = async () => week;
    d.numerology = async () => (await import('../src/numerology.js')).loadNumerology();
    d.config = async () => ({
      scheduleFileId: 'x'.repeat(24), vehicleType: 'car' as const,
      wishlist: { numbers: [15, 24, 42, 45, 51, 54, 56, 65, 5456, 8888, 9999], patterns: [{ name: 'เลขคู่สลับ', regex: '^(\\d)(\\d)\\1\\2$' }], digitSums: [9] },
      reminders: { daysBeforeOpen: [1], daysBeforeRegisterDeadline: [7, 1] },
    });
  };
  const bodies = (d: { calls: Array<{ method: string; path: string; body?: unknown }> }, method: string, path: string) =>
    d.calls.filter((c) => c.method === method && c.path === path).map((c) => c.body as { embeds?: Array<{ title: string }>; components?: unknown[] });

  it('🔄 เช็คตอนนี้ → แยกเป็นหลายข้อความในช่อง แต่ย้ายแผงครั้งเดียว', async () => {
    const d = await deps();
    await wide(d);
    d.now = new Date('2026-09-21T01:00:00Z');
    await run(d, button(COMMAND.check));
    expect(d.patched().at(-1)?.content).toContain('🔄 เช็คแล้ว');
    const posts = bodies(d, 'POST', '/channels/C/messages');
    const panels = posts.filter((b) => b.embeds?.[0].title === '🏠 dlt-plate-watcher');
    const notes = posts.filter((b) => !panels.includes(b));
    expect(notes.length).toBeGreaterThan(1); // เคยยัดใบเดียวแล้วโดน 400
    expect(panels).toHaveLength(1); // แผงขยับครั้งเดียว ไม่ใช่ทุกข้อความ
    expect(notes.flatMap((b) => b.embeds!)).toHaveLength(6); // 5 การ์ด + เตือนเปิดพรุ่งนี้ ครบ ไม่หาย
  });

  it('🎯 เลขในฝัน → PATCH ใบแรก แล้วต่อด้วย follow-up ephemeral · ปุ่มอยู่ข้อความสุดท้ายใบเดียว', async () => {
    const d = await deps();
    await wide(d);
    await run(d, button(COMMAND.match));
    const patched = bodies(d, 'PATCH', '/webhooks/app/tok/messages/@original');
    const follow = bodies(d, 'POST', '/webhooks/app/tok') as Array<{ embeds: unknown[]; components: unknown[]; flags?: number }>;
    expect(follow.length).toBeGreaterThan(0);
    expect(follow.at(-1)!.flags).toBe(64); // ยังเห็นเฉพาะคนกด
    expect(patched[0].components).toHaveLength(0);
    expect(follow.at(-1)!.components).toHaveLength(1);
    expect([...patched, ...follow].flatMap((b) => b.embeds as unknown[])).toHaveLength(5);
  });
});

// ช่อง 🔨 ในปุ่ม 🔢 — ผู้ใช้เจอเองว่าเลขไหนกดจองไม่ได้ (กฎในไฟล์ไม่ครอบคลุมทุกกรณี) · ADR-0006
describe('ทำเครื่องหมายเลขประมูลเอง', () => {
  const modalSubmit = (fields: Record<string, string>): Interaction => ({
    ...base, type: InteractionType.MODAL_SUBMIT,
    data: { custom_id: MODAL.addNumber, components: Object.entries(fields).map(([custom_id, value]) => ({ components: [{ custom_id, value }] })) },
  });

  it('ใส่เลขในช่อง 🔨 → ย้ายออกจากเลขที่รอจอง ลง events และเอากลับได้ด้วยช่องเพิ่ม', async () => {
    const d = await deps();
    await run(d, modalSubmit({ [MODAL.field]: '5456', [MODAL.auctionField]: '', [MODAL.excludeField]: '', [MODAL.removeField]: '' }));
    await run(d, modalSubmit({ [MODAL.field]: '', [MODAL.auctionField]: '5456', [MODAL.excludeField]: '', [MODAL.removeField]: '' }));
    expect(d.patched().at(-1)?.content).toContain('🔨 **5456** ทำเครื่องหมายว่าต้องประมูล');
    expect(await d.store.loadWishlist()).toMatchObject({ numbers: [5555], auction: [5456] });
    const ev = await d.store.recentEvents(1, HISTORY_KINDS);
    expect(ev[0]).toMatchObject({ kind: 'wishlist', payload: { markedAuction: [5456] } });

    await run(d, modalSubmit({ [MODAL.field]: '5456', [MODAL.auctionField]: '', [MODAL.excludeField]: '', [MODAL.removeField]: '' }));
    expect(d.patched().at(-1)?.content).toContain('♻️ **5456** เอาออกจากรายการเลขประมูลแล้ว');
    expect(await d.store.loadWishlist()).toMatchObject({ auction: [] });
  });

  it('เพิ่มเลขที่อยู่ในกฎประมูล → บอกกลุ่มทันทีตั้งแต่ตอนเพิ่ม', async () => {
    const d = await deps();
    d.auction = async () => (await import('../src/auction.js')).loadAuctionRules();
    await run(d, modalSubmit({ [MODAL.field]: '8888', [MODAL.auctionField]: '', [MODAL.excludeField]: '', [MODAL.removeField]: '' }));
    const text = d.patched().at(-1)!.content!;
    expect(text).toContain('🔨 **8888** เพิ่มแล้ว');
    expect(text).toContain('กลุ่ม "เลขสี่ตัวเหมือน" ขนส่งกันไว้ประมูล');
  });
});
