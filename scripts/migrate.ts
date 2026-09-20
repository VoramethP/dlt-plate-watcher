// รัน migration ใน drizzle/ ขึ้น Supabase — `npm run db:migrate`
// ใช้ DIRECT_DATABASE_URL (session mode, port 5432) ถ้ามี เพราะ migration ต้องการ connection ค้างยาว · ไม่มีก็ใช้ DATABASE_URL
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from '../src/db/client.js';

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL; // || ไม่ใช่ ?? — ค่าว่างใน .env ต้องถือว่าไม่ได้ตั้ง
if (!url) { console.error('ต้องตั้ง DATABASE_URL (หรือ DIRECT_DATABASE_URL) ใน .env ก่อน — ดู .env.example'); process.exit(1); }

const { db, close } = createDb(url);
try {
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('migrate เสร็จ — ตาราง notified · wishlist · meta · events พร้อมใช้');
} finally {
  await close();
}
