// ที่เก็บสถานะ — adapter สองแบบ: ไฟล์ใน .state/ (รันบนเครื่อง) หรือ Supabase (บน Vercel) · ADR-0005
// core.ts และ interactions.ts คุยผ่าน interface นี้เท่านั้น ไม่รู้ว่าข้างหลังเป็นอะไร
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadState, saveState, type State } from './state.js';

/** ใครทำ — user ใน Discord หรือ 'cron' */
export interface Actor { id: string; name: string }
export const CRON_ACTOR: Actor = { id: 'cron', name: 'cron' };

/** ชนิดเหตุการณ์ใน transaction log · ปุ่ม 📜 แสดงเฉพาะ HISTORY_KINDS */
export type EventKind = 'wishlist' | 'notify' | 'check' | 'ping' | 'panel' | 'clear' | 'daily' | 'won';
export const HISTORY_KINDS: EventKind[] = ['notify', 'wishlist', 'clear', 'ping', 'daily', 'won'];

export interface EventInput { kind: EventKind; actor?: Actor; payload?: Record<string, unknown> }
export interface StoredEvent extends EventInput { at: string }

export interface WishlistRows { numbers: number[]; exclude: number[]; auction: number[] }
/** ผลของการแก้ wishlist ที่ store ต้องบันทึก (มาจาก applyWishlistChange ใน actions.ts) */
export interface WishlistWrite extends WishlistRows { added: number[]; excluded: number[]; removed: number[]; markedAuction: number[] }

export interface Store {
  /** notified · lastScheduleVersion · owners — รูปเดียวกับไฟล์ state เดิม */
  loadState(): Promise<State>;
  /** บันทึก key ที่แจ้งไปแล้ว (append-only) และเวอร์ชันตารางล่าสุดถ้ามี */
  appendNotified(keys: string[], scheduleVersion?: string): Promise<void>;
  /** เลขที่ปุ่มแก้ได้ (numbers/exclude/auction) */
  loadWishlist(): Promise<WishlistRows>;
  /** เขียน wishlist หลังแก้ + จำว่าใครเพิ่ม · คืน owners ก่อนแก้ (ไว้บอกว่า "มีคนเล็งไว้ก่อนแล้ว") */
  saveWishlist(w: WishlistWrite, actor: Actor): Promise<Record<string, string>>;
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
  logEvent(e: EventInput): Promise<void>;
  /** ล่าสุดก่อน */
  recentEvents(limit: number, kinds?: EventKind[]): Promise<StoredEvent[]>;
  /** ปิด connection (Supabase) — CLI ต้องเรียกก่อนจบ ไม่งั้น process ค้าง */
  close?(): Promise<void>;
}

export interface FileStoreOptions {
  /** .state/notified.json */
  statePath: string;
  /** watch.config.json — wishlist.numbers/exclude อยู่ในนี้ */
  configPath: string;
}

/** โหมดไฟล์: state ใน .state/ · wishlist ใน watch.config.json · events ต่อท้าย .state/events.jsonl */
export function fileStore(opts: FileStoreOptions): Store {
  const eventsPath = join(dirname(opts.statePath), 'events.jsonl');
  const readConfigRaw = async () => {
    const raw = JSON.parse(await readFile(opts.configPath, 'utf8'));
    raw.wishlist ??= {}; raw.wishlist.numbers ??= []; raw.wishlist.exclude ??= []; raw.wishlist.auction ??= [];
    return raw as { wishlist: { numbers: number[]; exclude: number[]; auction: number[] } };
  };
  const patchState = async (fn: (s: State) => State) => saveState(opts.statePath, fn(await loadState(opts.statePath)));

  return {
    loadState: () => loadState(opts.statePath),
    appendNotified: (keys, scheduleVersion) => patchState((s) => ({
      ...s, notified: [...s.notified, ...keys], lastScheduleVersion: scheduleVersion ?? s.lastScheduleVersion,
    })),
    async loadWishlist() {
      const { wishlist } = await readConfigRaw();
      return { numbers: wishlist.numbers, exclude: wishlist.exclude, auction: wishlist.auction };
    },
    async saveWishlist(w, actor) {
      const raw = await readConfigRaw();
      raw.wishlist.numbers = w.numbers; raw.wishlist.exclude = w.exclude; raw.wishlist.auction = w.auction;
      await writeFile(opts.configPath, JSON.stringify(raw, null, 2) + '\n');
      let before: Record<string, string> = {};
      await patchState((s) => {
        before = { ...(s.owners ?? {}) };
        const owners = { ...before };
        for (const n of [...w.removed, ...w.excluded, ...w.markedAuction]) delete owners[n];
        for (const n of w.added) owners[n] ??= actor.name;
        return { ...s, owners };
      });
      return before;
    },
    async getMeta(key) { return (await loadState(opts.statePath)).meta?.[key]; },
    setMeta: (key, value) => patchState((s) => ({ ...s, meta: { ...(s.meta ?? {}), [key]: value } })),
    async logEvent(e) {
      await mkdir(dirname(eventsPath), { recursive: true });
      await appendFile(eventsPath, JSON.stringify({ at: new Date().toISOString(), ...e }) + '\n');
    },
    async recentEvents(limit, kinds) {
      let text: string;
      try { text = await readFile(eventsPath, 'utf8'); } catch { return []; }
      const all = text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as StoredEvent);
      return all.filter((e) => !kinds || kinds.includes(e.kind)).slice(-limit).reverse();
    },
  };
}

/** มี DATABASE_URL → Supabase (โหลด driver เฉพาะตอนนั้น จะได้ไม่ดึง postgres เข้ามาตอนรัน CLI เฉย ๆ) · ไม่มี → ไฟล์ */
export async function createStore(opts: FileStoreOptions & { databaseUrl?: string }): Promise<Store> {
  if (opts.databaseUrl) {
    const { supabaseStore } = await import('./db/store.js');
    return supabaseStore(opts.databaseUrl);
  }
  return fileStore(opts);
}
