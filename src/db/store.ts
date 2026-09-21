// Store บน Supabase — ADR-0005 · แต่ละเมธอดคือหนึ่ง transaction (modal หนึ่งครั้ง = เขียน wishlist + owners ครบหรือไม่เลย)
import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { State } from '../state.js';
import type { EventKind, Store, StoredEvent } from '../store.js';
import { createDb } from './client.js';
import { events, meta, notified, wishlist } from './schema.js';

export function supabaseStore(databaseUrl: string): Store {
  const { db, close } = createDb(databaseUrl);
  /**
   * อ่าน jsonb เป็น text ตรง ๆ (`#>> '{}'`) ห้ามให้ผ่าน JSON.parse
   * เพราะ postgres-js parse jsonb มาให้แล้ว drizzle parse ซ้ำอีกรอบ → id ของ Discord (18 หลัก)
   * กลายเป็น number ที่เกิน MAX_SAFE_INTEGER แล้วถูกปัดท้าย (…945 → …900) ลบข้อความผิดใบทั้งวัน (21 ก.ย.)
   */
  const getMeta = async (key: string) => {
    const row = await db.select({ v: sql<string>`${meta.v} #>> '{}'` }).from(meta).where(eq(meta.k, key)).limit(1);
    return row[0]?.v ?? undefined;
  };
  const setMeta = async (key: string, value: string) => {
    await db.insert(meta).values({ k: key, v: value }).onConflictDoUpdate({ target: meta.k, set: { v: value } });
  };

  return {
    async loadState(): Promise<State> {
      // 500 ล่าสุดพอ เหมือนไฟล์เดิม — key ผูกกับวันที่ ของเก่าไม่ซ้ำอีก
      const keys = await db.select({ key: notified.key }).from(notified).orderBy(desc(notified.at)).limit(500);
      const want = await db.select({ number: wishlist.number, name: wishlist.ownerName }).from(wishlist).where(eq(wishlist.kind, 'want'));
      return {
        notified: keys.map((r) => r.key).reverse(),
        lastScheduleVersion: await getMeta('lastScheduleVersion'),
        owners: Object.fromEntries(want.map((r) => [String(r.number), r.name])),
      };
    },
    async appendNotified(keys, scheduleVersion) {
      await db.transaction(async (tx) => {
        if (keys.length) await tx.insert(notified).values(keys.map((key) => ({ key }))).onConflictDoNothing();
        if (scheduleVersion) await tx.insert(meta).values({ k: 'lastScheduleVersion', v: scheduleVersion }).onConflictDoUpdate({ target: meta.k, set: { v: scheduleVersion } });
      });
    },
    async loadWishlist() {
      const rows = await db.select({ number: wishlist.number, kind: wishlist.kind }).from(wishlist).orderBy(wishlist.number);
      return {
        numbers: rows.filter((r) => r.kind === 'want').map((r) => r.number),
        exclude: rows.filter((r) => r.kind === 'exclude').map((r) => r.number),
        auction: rows.filter((r) => r.kind === 'auction').map((r) => r.number),
      };
    },
    async saveWishlist(w, actor) {
      return db.transaction(async (tx) => {
        const want = await tx.select({ number: wishlist.number, name: wishlist.ownerName }).from(wishlist).where(eq(wishlist.kind, 'want'));
        const before = Object.fromEntries(want.map((r) => [String(r.number), r.name]));
        if (w.removed.length) await tx.delete(wishlist).where(inArray(wishlist.number, w.removed));
        // ย้ายจาก want → exclude (หรือกลับ) = คนล่าสุดที่สั่งเป็นเจ้าของ · เพิ่มเลขที่มีอยู่แล้วไม่ทับเจ้าของเดิม
        for (const n of w.excluded) {
          await tx.insert(wishlist).values({ number: n, kind: 'exclude', ownerId: actor.id, ownerName: actor.name })
            .onConflictDoUpdate({ target: wishlist.number, set: { kind: 'exclude', ownerId: actor.id, ownerName: actor.name, addedAt: sql`now()` } });
        }
        for (const n of w.markedAuction) {
          await tx.insert(wishlist).values({ number: n, kind: 'auction', ownerId: actor.id, ownerName: actor.name })
            .onConflictDoUpdate({ target: wishlist.number, set: { kind: 'auction', ownerId: actor.id, ownerName: actor.name, addedAt: sql`now()` } });
        }
        for (const n of w.added) {
          await tx.insert(wishlist).values({ number: n, kind: 'want', ownerId: actor.id, ownerName: actor.name })
            .onConflictDoUpdate({ target: wishlist.number, set: { kind: 'want', ownerId: actor.id, ownerName: actor.name, addedAt: sql`now()` } });
        }
        return before;
      });
    },
    getMeta,
    setMeta,
    async logEvent(e) {
      await db.insert(events).values({ kind: e.kind, actorId: e.actor?.id, actorName: e.actor?.name, payload: e.payload ?? {} });
    },
    async recentEvents(limit, kinds?: EventKind[]): Promise<StoredEvent[]> {
      const rows = await db.select().from(events)
        .where(kinds ? inArray(events.kind, kinds) : undefined)
        .orderBy(desc(events.id)).limit(limit);
      return rows.map((r) => ({
        at: r.at.toISOString(),
        kind: r.kind as EventKind,
        actor: r.actorId ? { id: r.actorId, name: r.actorName ?? r.actorId } : undefined,
        payload: (r.payload ?? {}) as Record<string, unknown>,
      }));
    },
    close,
  };
}
