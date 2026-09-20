// ตาราง Supabase (Drizzle) — ADR-0005 · ทุกตารางเปิด RLS โดยไม่มี policy: ปิด Data API (anon/authenticated) ไว้
// โค้ดของเราต่อผ่าน DATABASE_URL ด้วย role ที่เป็นเจ้าของตาราง จึงข้าม RLS ได้เอง
import { bigint, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** key ที่แจ้งไปแล้ว — pk กันซ้ำระดับฐานข้อมูล แม้ cron กับคนกด 🔄 จะชนกัน */
export const notified = pgTable('notified', {
  key: text('key').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** เลขที่ปุ่ม 🔢 แก้ได้ — kind 'want' | 'exclude' · owner = คนที่เพิ่ม (ชื่อโชว์เปลี่ยนได้ จึงเก็บ id ด้วย) */
export const wishlist = pgTable('wishlist', {
  number: integer('number').primaryKey(),
  kind: text('kind', { enum: ['want', 'exclude'] }).notNull(),
  ownerId: text('owner_id').notNull(),
  ownerName: text('owner_name').notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** ค่าเดี่ยว: lastScheduleVersion · panelMessageId · lastCheckAt */
export const meta = pgTable('meta', {
  k: text('k').primaryKey(),
  v: jsonb('v').notNull(),
}).enableRLS();

/** transaction log — ทุกเหตุการณ์ที่ระบบทำหรือมีคนทำ เก็บตลอด · ปุ่ม 📜 อ่านจากนี่ */
export const events = pgTable('events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actorId: text('actor_id'),
  actorName: text('actor_name'),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull().default({}),
}).enableRLS();
