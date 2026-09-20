# HANDOFF

> **เขียนทับทั้งไฟล์ทุกครั้งที่ส่งมอบ** ไม่ต่อท้าย — ไฟล์นี้คือ "ไม้ที่กำลังส่ง" ไม่ใช่ประวัติ
> ส่งมอบเมื่อ: 2026-09-20 · เหตุผล: **Phase 6 โค้ดเสร็จและ commit แล้ว** ที่เหลือคือขั้นตอนในเบราว์เซอร์ที่ผู้ใช้ต้องทำเอง (สร้าง Supabase/Vercel · ใส่ URL ใน Developer Portal) แล้วทดสอบจริง

## ทำอะไรไปในเซสชันนี้

- grill 3 รอบ → ADR-0005 → เขียน Phase 6 ทั้งก้อน commit `90f2bdb` (รายละเอียดใน `docs/WORKLOG.md` › 2026-09-20)
- ผู้ใช้เพิ่มความต้องการ: **เก็บ transaction** → ตาราง `events` ทุกเหตุการณ์ (ใครเพิ่ม/ลบเลข · แจ้งอะไร · ใครลบแชต · cron) เก็บตลอด · ปุ่ม 📜 อ่านจากตารางนี้
- ตัด gateway/discord.js/`watch`/daily-check.yml · CLI `check` + webhook ยังอยู่เป็น fallback

## สถานะ ณ ตอนส่ง

- **working tree:** สะอาดหลัง commit docs · 81/81 เทสผ่าน · typecheck ผ่าน · `check --dry-run` กับ Drive จริงผ่าน
- **ยังไม่เคย deploy จริง** — ทุกอย่างทดสอบด้วย fake DiscordRest + store ไฟล์ + smoke ยิง `POST()` ตรง ๆ
- **`watch` เก่าบน Mac ยังรันอยู่** (`pgrep -fl 'src/cli.ts watch'` → pid 8525) ใช้โค้ดเก่าในหน่วยความจำ ปุ่มยังตอบได้จนกว่าจะปิด · ปิดด้วย `pkill -f 'src/cli.ts watch'` **หลัง** Vercel ขึ้นแล้วเท่านั้น (ไม่งั้น 2 bot ตอบซ้อน หรือไม่มีใครตอบ)

## ค้างอยู่ตรงไหน — เช็คลิสต์ที่ผู้ใช้ต้องทำในเบราว์เซอร์ (ตาม README › โหมด Vercel)

| # | ที่ไหน | ทำอะไร | ได้ค่าอะไร |
|---|---|---|---|
| 1 | Discord Developer Portal › General Information | คัดลอก Application ID, Public Key | `DISCORD_APP_ID` `DISCORD_PUBLIC_KEY` |
| 2 | Supabase › New project (Singapore) › Settings › Database | Transaction pooler URI (6543) + Session pooler (5432) | `DATABASE_URL` `DIRECT_DATABASE_URL` |
| 3 | เครื่อง: ใส่ 2 ค่าใน `.env` | `npm run db:migrate` | ตาราง 4 ตารางบน Supabase |
| 4 | Vercel › Add New Project › import repo · Settings › Environment Variables | ใส่ `DISCORD_BOT_TOKEN` `DISCORD_CHANNEL_ID` `DISCORD_PUBLIC_KEY` `DATABASE_URL` `CRON_SECRET` (`openssl rand -hex 32`) `WATCH_CONFIG_JSON` (ไฟล์ทั้งก้อนบรรทัดเดียว) | URL `https://<app>.vercel.app` |
| 5 | Developer Portal › General Information › Interactions Endpoint URL | `https://<app>.vercel.app/api/interactions` → Save | ต้องขึ้นว่าบันทึกสำเร็จ (= PING/PONG ผ่าน) |
| 6 | เครื่อง (`.env` มี `DISCORD_BOT_TOKEN` + `DISCORD_APP_ID` + `DISCORD_GUILD_ID`) | `npm run register` | `/panel` ใช้ได้ |
| 7 | cron-job.org | job GET `https://<app>.vercel.app/api/cron/ping` · 09:50 Asia/Bangkok ทุกวัน · header `Authorization: Bearer <CRON_SECRET>` | ปิง 09:50 |

## ทำต่อยังไง (เซสชันถัดไป)

1. ถ้า **Vercel build พัง**: จุดเสี่ยงที่รู้คือ `api/*.ts` import `../src/*.js` แบบ ESM + NodeNext — ดู log ก่อน · ทางแก้สำรอง: ให้ `api/` import จาก `dist/` หลัง `npm run build` (ต้องตั้ง Build Command = `npm run build`) หรือเปลี่ยน import ใน `api/` เป็นไม่มี `.js`
2. ถ้า **Interactions Endpoint URL บันทึกไม่ผ่าน**: Discord ยิง PING + request ลายเซ็นปลอมมาทดสอบ · เช็ค `DISCORD_PUBLIC_KEY` ตรงกับ app เดียวกับ token · ดู Vercel › Logs ว่า 401 หรือ 500
3. ทดสอบจริงบน Discord ทีละอย่าง: `/panel` → 🔢 (เพิ่ม/ไม่อยากได้/ลบ) → 📋 → 📜 (ต้องเห็นบรรทัด 🔢 ที่เพิ่งทำ) → 🔄 → 🧹 → ❓ → 📤 ใต้การ์ด · `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>.vercel.app/api/cron/check`
4. เปิด Supabase › Table Editor › `events` ดูว่าแถวขึ้นครบ (actor_id/actor_name/kind/payload)
5. ผ่านหมด → `pkill -f 'src/cli.ts watch'` บน Mac · อัปเดต HOTCACHE "ตอนนี้อยู่ตรงไหน" เป็น "รันบน Vercel แล้ว" · WORKLOG บันทึกสิ่งที่พังตอน deploy จริง (ถ้ามี)
6. จ. 21 ก.ย. 2569 `npm run schedule` → ยืนยัน ADR-0003 file id คงที่ · ถ้าเปลี่ยนทุกสัปดาห์ ย้าย `scheduleFileId` จาก env ไปตาราง `meta` + เพิ่มทางแก้ผ่าน Discord
7. ค่อยทำ: drawio หน้า 06 เพิ่มวิธี D (แก้ใน draw.io โดยตรง ไม่มี generator) · export PNG ใหม่

## สิ่งที่ตกลงกันไว้แต่ยังไม่ได้เขียนลงไฟล์ไหน

- ผู้ใช้ตอบ "เอาตามที่แนะนำ" ทั้ง 3 รอบ grill — ตัวเลือกที่ไม่ได้เลือกอยู่ใน ADR-0005 ครบแล้ว
- ผู้ใช้ตั้งใจให้ `events` เป็นของ "เช็คได้เฉย ๆ" — ไม่ต้องทำหน้าเลื่อน/กรอง/สรุปใน Discord · 15 บรรทัดล่าสุดพอ ที่เหลือดูใน Supabase
- npm audit 4 moderate จาก esbuild เก่าที่ drizzle-kit ดึงมา — dev-only ยังไม่ต้องทำอะไร

## เกณฑ์ว่าไม้นี้ส่งได้จริง
เปิดแชตใหม่ อ่านไฟล์นี้ + `HOTCACHE.md` แล้วพาผู้ใช้ทำเช็คลิสต์ 7 ข้อได้ทันที และรู้ว่าถ้า deploy พังต้องดูตรงไหนก่อน
