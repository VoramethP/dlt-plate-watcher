// drizzle-kit: `npm run db:generate` สร้าง SQL ใน drizzle/ จาก schema (ไม่ต้องต่อฐาน) · migrate ผ่าน scripts/migrate.ts
// ห้าม `drizzle-kit push` — มัน diff แล้วแก้ให้ตรง ลบ RLS ได้เงียบ ๆ
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
