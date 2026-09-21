// ย้ายข้อมูลจากโหมดไฟล์ (watch.config.json + .state/notified.json) ขึ้น Supabase — `npm run db:import`
// รันซ้ำได้: เลขที่มีแล้วไม่ทับเจ้าของ · key ที่แจ้งแล้วไม่ซ้ำ · ทำครั้งเดียวตอนย้ายจะได้ไม่แจ้งซ้ำสิ่งที่ bot บนเครื่องเคยส่ง
import { readFile } from 'node:fs/promises';
import { createStore } from '../src/store.js';

const url = process.env.DATABASE_URL;
if (!url) { console.error('ต้องตั้ง DATABASE_URL ใน .env ก่อน'); process.exit(1); }

const store = await createStore({ statePath: '.state/notified.json', configPath: 'watch.config.json', databaseUrl: url });
try {
  const cfg = JSON.parse(await readFile('watch.config.json', 'utf8'));
  const numbers: number[] = cfg.wishlist?.numbers ?? [];
  const exclude: number[] = cfg.wishlist?.exclude ?? [];
  const local = JSON.parse(await readFile('.state/notified.json', 'utf8').catch(() => '{"notified":[]}'));
  const owners: Record<string, string> = local.owners ?? {};
  const before = await store.loadWishlist();
  // state เดิมจำเจ้าของเป็นชื่อโชว์อย่างเดียว ไม่มี user id → ใช้ชื่อเป็น id ไปก่อน (ปุ่มครั้งถัดไปจะได้ id จริง)
  let added = 0;
  for (const n of numbers.filter((n) => !before.numbers.includes(n))) {
    const who = owners[n] ?? 'import';
    await store.saveWishlist({ numbers: [], exclude: [], auction: [], added: [n], excluded: [], removed: [], markedAuction: [] }, { id: who, name: who });
    added++;
  }
  let excluded = 0;
  for (const n of exclude.filter((n) => !before.exclude.includes(n))) {
    await store.saveWishlist({ numbers: [], exclude: [], auction: [], added: [], excluded: [n], removed: [], markedAuction: [] }, { id: 'import', name: 'import' });
    excluded++;
  }
  const keys: string[] = local.notified ?? [];
  await store.appendNotified(keys, local.lastScheduleVersion);
  await store.logEvent({ kind: 'check', actor: { id: 'import', name: 'import' }, payload: { note: 'ย้ายจากโหมดไฟล์', added, excluded, notified: keys.length } });
  const after = await store.loadWishlist();
  const st = await store.loadState();
  console.log(`เพิ่ม ${added} เลข · ไม่อยากได้ ${excluded} · notified ${keys.length} key`);
  console.log(`บน Supabase ตอนนี้: ${after.numbers.length} เลข · 🚫 ${after.exclude.length} · notified ${st.notified.length} key · เวอร์ชันตาราง ${st.lastScheduleVersion ?? '-'} · เจ้าของ ${Object.keys(st.owners ?? {}).length} เลข`);
} finally {
  await store.close?.();
}
