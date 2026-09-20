# HANDOFF

> **เขียนทับทั้งไฟล์ทุกครั้งที่ส่งมอบ** ไม่ต่อท้าย — ไฟล์นี้คือ "ไม้ที่กำลังส่ง" ไม่ใช่ประวัติ
> ส่งมอบเมื่อ: 2026-09-21 (ตี 1) · เหตุผล: **Phase 6 ปิดงาน** — bot อยู่บน Vercel + Neon ครบ ผู้ใช้ประกาศปิด รอดูผล cron 08:00 รอบแรกเท่านั้น

## ทำอะไรไปในเซสชันนี้ (20–21 ก.ย.)

- **Phase 6 ทั้งก้อน**: grill 3 รอบ → ADR-0005 → Interactions Endpoint (`api/`) + Store adapter + Postgres 4 ตาราง (รวม `events` transaction log ตามที่ผู้ใช้ขอ) → ตัด gateway/discord.js/`watch`/daily-check.yml
- **ขึ้น production จริง**: Vercel (env ผ่าน CLI) · ผู้ใช้ตั้ง Interactions Endpoint URL + cron-job.org 09:50 · ทุกปุ่มทดสอบบน Discord จริง · แก้บั๊ก 📋 เกิน 1024 + error รั่ว token
- **ย้าย DB Supabase → Neon** (โควตาฟรี Supabase 2 โปรเจกต์) ด้วย `npm run db:copy` โค้ด runtime 0 บรรทัด · Supabase ลบแล้ว
- ปิด `watch` เก่าบน Mac · Vercel ต่อ GitHub อยู่แล้ว push = deploy
- รายละเอียด: `docs/WORKLOG.md` › 2026-09-20 (2 หัวข้อ) + 2026-09-21

## สถานะ ณ ตอนส่ง

- **git:** commit นี้ push แล้ว · working tree สะอาด · 83/83 เทสผ่าน · typecheck ผ่าน
- **production:** `https://dlt-plate-watcher.vercel.app` (deploy อัตโนมัติจาก `main`) · env 6 ตัว: `DISCORD_BOT_TOKEN` `DISCORD_CHANNEL_ID` `DISCORD_PUBLIC_KEY` `DATABASE_URL`(Neon) `CRON_SECRET` `WATCH_CONFIG_JSON`
- **Neon (Singapore):** `notified` 8 · `wishlist` 13 · `meta` 3 · `events` 10+ · RLS on ไม่มี policy · ชื่อฟังก์ชัน `supabaseStore` ใน `src/db/store.ts` ยังเป็นชื่อเดิม (คือ Postgres store)
- **cron:** Vercel Cron `0 1 * * *` (08:00 ไทย ±59 นาที) → `/api/cron/check` · cron-job.org 09:50 → `/api/cron/ping` (test run ได้ 200)
- **บนเครื่อง:** `.env` ครบ (Neon ทั้ง `DATABASE_URL` pooler + `DIRECT_DATABASE_URL`) · ไม่มี process รันค้าง · `.vercel/` link แล้ว

## ค้างอยู่ตรงไหน

**ไม่มีงานค้าง** · สิ่งเดียวที่ยังไม่เห็นด้วยตา: Vercel Cron 08:00 ยิงจริงครั้งแรก (แถว `events` ล่าสุดตอนนี้คือ `cron · check` 00:25 ที่ยิงทดสอบด้วยมือ)

## ทำต่อยังไง

1. **ผู้ใช้จะมาบอกผล cron 08:00 เอง** — เช็คให้: Neon › Tables › `events` ต้องมี `cron · check` เวลา 08:00–09:00 · ถ้าขนส่งออกตารางใหม่ ช่องต้องได้ 📅 + 🎯 และแผงย้ายมาล่างสุด · ถ้าไม่มีแถว → Vercel › Settings › Cron Jobs (enabled?) + `npx vercel logs dlt-plate-watcher.vercel.app`
2. พร้อมกันนั้นยืนยัน ADR-0003: `npm run schedule` เวอร์ชันตารางเปลี่ยนโดย file id เดิมไหม → บันทึก WORKLOG · ถ้า id เปลี่ยนทุกสัปดาห์ → ย้าย `scheduleFileId` ไป `meta` + ปุ่ม/modal แก้จาก Discord
3. ค่อยทำ (ไม่รีบ): drawio หน้า 06 เพิ่มวิธี D (แก้ใน draw.io ตรง ๆ ไม่มี generator) · README ส่วน Vercel เพิ่มทางเลือก CLI · ตั้ง Ignored Build Step ถ้ารำคาญ deploy ตอนแก้เอกสาร
4. ถ้าเพิ่มปุ่ม: แก้ 4 ที่ — `actions.ts` (BTN/rows) · `interactions.ts` (route) · `guideEmbeds()` · `docs/UI-GUIDE.md` · เทสใน `interactions.test.ts` ด้วย fake DiscordRest · embed field ที่ยาวไม่แน่นอนผ่าน `fitField`

## สิ่งที่ตกลงกันไว้แต่ยังไม่ได้เขียนลงไฟล์ไหน

- ผู้ใช้ทำขั้นตอนในบัญชีตัวเอง (Developer Portal, cron-job.org, ลบ Supabase) — ผมไม่แตะ · env บน Vercel ใส่ผ่าน CLI pipe จาก `.env` โดยไม่พิมพ์ค่า (`vercel env rm` แล้ว `add` ทั้ง production + preview) — ใช้วิธีนี้ต่อไป
- `WATCH_CONFIG_JSON` บน Vercel = snapshot ของ `watch.config.json` วันที่ 20 ก.ย. · แก้ pattern/reminders ต้องอัปเดตทั้งสองที่
- ผู้ใช้เข้าใจแล้วว่า: ช่องเงียบตอนเช้า = ปกติ (แจ้งเฉพาะเรื่องใหม่) · bot ไม่มีวันบอกว่าเลขถูกจองไปแล้ว (ADR-0001/0003)
- MongoDB ถูกถามและปัดไป (ADR-0005 › หมายเหตุ) — ถ้าถูกถามอีก คำตอบเดิม: `Store` interface รองรับ แต่ไม่มีเหตุผลเทคนิคให้ย้าย
- npm audit 4 moderate (esbuild เก่าจาก drizzle-kit, dev-only) ยังไม่ทำอะไร

## เกณฑ์ว่าไม้นี้ส่งได้จริง
เปิดแชตใหม่ อ่านไฟล์นี้ + `HOTCACHE.md` แล้วเมื่อผู้ใช้บอกว่า "เช็ค cron ให้หน่อย" รู้ทันทีว่าต้องดูตาราง `events` บน Neon และ Vercel logs ตรงไหน
