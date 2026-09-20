// คัดลอกข้อมูลทั้ง 4 ตารางจาก OLD_DATABASE_URL → DATABASE_URL (ย้ายผู้ให้บริการ Postgres) — `npm run db:copy`
// ปลายทางต้อง migrate แล้ว · รันซ้ำได้ (upsert) · events คง id/เวลาเดิมเพราะเป็นประวัติ
import postgres from 'postgres';

const from = process.env.OLD_DATABASE_URL; const to = process.env.DATABASE_URL;
if (!from || !to) { console.error('ต้องตั้ง OLD_DATABASE_URL (ต้นทาง) และ DATABASE_URL (ปลายทาง) ใน .env'); process.exit(1); }
const src = postgres(from, { prepare: false, max: 1 }); const dst = postgres(to, { prepare: false, max: 1 });
try {
  const notified = await src`select key, at from notified`;
  const wishlist = await src`select number, kind, owner_id, owner_name, added_at from wishlist`;
  const meta = await src`select k, v from meta`;
  const events = await src`select id, at, actor_id, actor_name, kind, payload from events order by id`;
  await dst.begin(async (tx) => {
    for (const r of notified) await tx`insert into notified ${tx(r)} on conflict (key) do nothing`;
    for (const r of wishlist) await tx`insert into wishlist ${tx(r)} on conflict (number) do update set kind = excluded.kind, owner_id = excluded.owner_id, owner_name = excluded.owner_name, added_at = excluded.added_at`;
    for (const r of meta) await tx`insert into meta ${tx(r)} on conflict (k) do update set v = excluded.v`;
    // id เป็น identity ALWAYS → ต้อง OVERRIDING SYSTEM VALUE แล้วดัน sequence ให้เลยของเก่า
    for (const r of events) await tx`insert into events (id, at, actor_id, actor_name, kind, payload) overriding system value values (${r.id}, ${r.at}, ${r.actor_id}, ${r.actor_name}, ${r.kind}, ${r.payload}) on conflict (id) do nothing`;
    if (events.length) await tx`select setval(pg_get_serial_sequence('events', 'id'), (select max(id) from events))`;
  });
  const count = async (sql: postgres.Sql) => ({
    notified: (await sql`select count(*)::int as n from notified`)[0].n,
    wishlist: (await sql`select count(*)::int as n from wishlist`)[0].n,
    meta: (await sql`select count(*)::int as n from meta`)[0].n,
    events: (await sql`select count(*)::int as n from events`)[0].n,
  });
  const [a, b] = [await count(src), await count(dst)];
  console.log('ต้นทาง :', JSON.stringify(a)); console.log('ปลายทาง:', JSON.stringify(b));
  console.log(JSON.stringify(a) === JSON.stringify(b) ? '✅ จำนวนแถวตรงกันทุกตาราง' : '⚠️ จำนวนไม่ตรง — ตรวจก่อนสลับ');
} finally { await src.end(); await dst.end(); }
