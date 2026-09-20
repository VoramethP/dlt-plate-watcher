# HANDOFF

> **เขียนทับทั้งไฟล์ทุกครั้งที่ส่งมอบ** ไม่ต่อท้าย — ไฟล์นี้คือ "ไม้ที่กำลังส่ง" ไม่ใช่ประวัติ
> ส่งมอบเมื่อ: 2026-09-20 · เหตุผล: **Phase 6 ขึ้น production แล้วและทดสอบบน Discord จริงผ่าน** — ปิดงานก้อนใหญ่ เหลือแค่เฝ้าดู cron รอบแรกพรุ่งนี้

## ทำอะไรไปในเซสชันนี้

- grill → ADR-0005 → เขียน Phase 6 ทั้งก้อน → migrate/import Supabase → deploy Vercel ด้วย CLI → ผู้ใช้ตั้ง Interactions Endpoint URL + cron-job.org → ทดสอบทุกปุ่มบน Discord จริง → แก้บั๊ก 📋 เกิน 1024 + error รั่ว token → deploy ใหม่ · ปิด `watch` เก่าบน Mac แล้ว
- รายละเอียดใน `docs/WORKLOG.md` › 2026-09-20 (2 หัวข้อ)

## สถานะ ณ ตอนส่ง

- **production:** `https://dlt-plate-watcher.vercel.app` (deployment `apopcqozu` = commit `d4cc43f`) · env 6 ตัวครบ · Vercel Cron 08:00 ไทย · cron-job.org 09:50 ทดสอบได้ 200
- **Supabase:** 4 ตาราง RLS on ไม่มี policy · wishlist 8 เลข 🚫 2 · notified 8 key · events มีแถวจาก import/cron/ปุ่ม
- **git:** commit ล่าสุด `d4cc43f` push แล้ว · working tree มี HANDOFF/HOTCACHE/WORKLOG ที่กำลัง commit
- **บนเครื่อง:** `.env` ครบทุกค่า (`DIRECT_DATABASE_URL` = session pooler 5432 ต่อได้) · `.vercel/` link แล้ว · `.env.local` ของ Vercel CLI ถูก ignore
- 83 เทสผ่าน · typecheck ผ่าน

## ค้างอยู่ตรงไหน

ไม่มีงานค้างที่บล็อกผู้ใช้ · สิ่งที่ยังไม่ได้เห็นด้วยตา: **Vercel Cron 08:00 ยิงจริงครั้งแรก** (จ. 21 ก.ย.)

## ทำต่อยังไง

1. **จ. 21 ก.ย. หลัง 08:00–09:00** (Hobby คลาดได้ ±59 นาที): เช็คตาราง `events` มี `cron · check` ใหม่ไหม · ถ้าขนส่งออกตารางใหม่ ช่องต้องได้ 📅 + 🎯 และแผงย้ายมาล่างสุด · ถ้าไม่ยิง ดู Vercel › Settings › Cron Jobs ว่า enabled และ `npx vercel logs dlt-plate-watcher.vercel.app`
2. ยืนยัน ADR-0003: `npm run schedule` เวอร์ชันตารางเปลี่ยนโดย file id เดิมไหม → บันทึกใน WORKLOG · ถ้า id เปลี่ยนทุกสัปดาห์ → ย้าย `scheduleFileId` ไปตาราง `meta` + ปุ่ม/modal แก้จาก Discord (แก้ `WATCH_CONFIG_JSON` บน Vercel ทุกสัปดาห์ไม่ไหว)
3. ค่อยทำ: `npx vercel git connect` ให้ push แล้ว deploy เอง (ตอนนี้ deploy ด้วย `npx vercel deploy --prod --yes`) · drawio หน้า 06 เพิ่มวิธี D · README ส่วน Vercel เพิ่มทางเลือก CLI
4. ถ้าเพิ่มปุ่ม: แก้ 4 ที่ — `actions.ts` (BTN/rows) · `interactions.ts` (route) · `guideEmbeds()` · `docs/UI-GUIDE.md` · เทสใน `interactions.test.ts` ด้วย fake DiscordRest · **ทุก embed field ผ่าน `fitField`** ถ้าความยาวไม่แน่นอน

## สิ่งที่ตกลงกันไว้แต่ยังไม่ได้เขียนลงไฟล์ไหน

- ผู้ใช้ทำขั้นตอนในบัญชีตัวเอง (Developer Portal, cron-job.org) — ผมไม่แตะ · env ใส่ Vercel ผ่าน CLI pipe จาก `.env` โดยไม่พิมพ์ค่า — ใช้วิธีนี้ต่อไปเมื่อต้องเพิ่ม env
- `WATCH_CONFIG_JSON` บน Vercel = snapshot ของ `watch.config.json` วันนี้ · แก้ pattern/reminders ต้องอัปเดตทั้งสองที่ (ไฟล์บนเครื่องสำหรับ CLI fallback)
- npm audit 4 moderate (esbuild เก่าจาก drizzle-kit, dev-only) ยังไม่ทำอะไร

## เกณฑ์ว่าไม้นี้ส่งได้จริง
เปิดแชตใหม่ อ่านไฟล์นี้ + `HOTCACHE.md` แล้วตอบได้ทันทีว่า bot รันที่ไหน deploy ยังไง และพรุ่งนี้ต้องดูอะไรตรงไหน
