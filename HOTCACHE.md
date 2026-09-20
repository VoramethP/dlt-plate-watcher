# 🔥 HOTCACHE

> อ่านไฟล์นี้หลัง `HANDOFF.md` · **ห้ามเกิน 500 คำ** (`wc -w`)
> Updated: **2026-09-20**

## โปรเจกต์นี้คืออะไร

Discord bot เฝ้าตาราง PDF เปิดจองเลขทะเบียนรถของขนส่งจาก Google Drive → เทียบ wishlist → แจ้งเตือน + landing panel มีปุ่ม · **แจ้งเตือนอย่างเดียว ไม่จองแทน** · public repo `VoramethP/dlt-plate-watcher`

## ตอนนี้อยู่ตรงไหน

**Phase 6 ขึ้นจริงแล้ว (20 ก.ย.)** — `https://dlt-plate-watcher.vercel.app` · Interactions Endpoint ตั้งแล้ว · `/panel` + ทุกปุ่มทดสอบบน Discord จริงผ่าน · cron-job.org 09:50 ตั้งแล้ว (200) · Vercel Cron 08:00 · `watch` เก่าบน Mac ปิดแล้ว
state บน **Neon Postgres** (ย้ายจาก Supabase 21 ก.ย. — โควตาฟรี 2 โปรเจกต์ · ADR-0005 › หมายเหตุ) 4 ตาราง `notified` `wishlist` `meta` `events` · CLI `check` + webhook + `.state/` ยังเป็น fallback · 83 เทส
deploy ด้วย `npx vercel deploy --prod --yes` (โปรเจกต์ link แล้วใน `.vercel/` · env ใส่ผ่าน CLI ครบ 6 ตัว)

## กฎเหล็ก

1. ไม่จองแทน ไม่ล็อกอิน ThaID ไม่ยิงหน้าจอง ไม่เช็คว่าเลขถูกจองแล้ว (ADR-0001) — ผู้ใช้ยอมรับแล้ว อย่าเสนอทางอ้อม
2. ไม่ปลอม User-Agent ผ่าน WAF · โค้ดแตะแค่ drive.google.com + discord.com + Supabase ตัวเอง (ADR-0003)
3. ไม่มีข้อมูลส่วนบุคคลใน config/state/events (events เก็บแค่ Discord user id + ชื่อโชว์)
4. เลขศาสตร์ต้องมี source ต่อรายการ ห้ามแต่งเอง (`numerology.json` › sources)
5. migration ผ่าน `db:generate` + `db:migrate` เท่านั้น ห้าม `drizzle-kit push` · ห้ามแก้ตารางใน dashboard

## งานถัดไป

1. **จ. 21 ก.ย. 08:00** ดูว่า Vercel Cron ยิงจริงไหม (ตาราง `events` ต้องมี `cron · check` · แผงต้องขยับถ้ามีตารางใหม่) → ยืนยัน ADR-0003 file id คงที่? แล้วบันทึกผล
2. ค่อยทำ: drawio หน้า 06 เพิ่มวิธี D (Vercel) · ต่อ Vercel กับ GitHub (`npx vercel git connect`) ให้ push แล้ว deploy เอง
3. บั๊กจากผู้ใช้: ดู Vercel › Logs (`npx vercel logs dlt-plate-watcher.vercel.app`) และตาราง `events` ใน Neon ก่อน · error ของ interaction ตอบกลับผู้กดแล้ว (`❌ bot พลาด: …`)

## กับดักที่เคยเจอ

- **Vercel Hobby cron: วันละครั้งต่อ job, คลาด ±59 นาที** → 09:50 ใช้ cron-job.org
- **Vercel ไม่มี framework ต้องมี `public/`** ไม่งั้น "No Output Directory" · `vercel link` เขียน `.env*` ลง .gitignore (กลบ .env.example) → แก้เป็น `.env.local`
- **Supabase Direct connection (`db.<ref>.supabase.co`) เป็น IPv6 อย่างเดียว** → ใช้ pooler เท่านั้น (6543 transaction / 5432 session)
- **embed field ต้องนับตัวอักษรจริง ไม่ใช่จำนวนบรรทัด** — 📋 พังบน Discord จริงเพราะเลขศาสตร์ทำให้เกิน 1024 (`fitField`)
- **error ที่ส่งกลับในช่องห้ามมี path `/webhooks/<app>/<token>`** — เคยรั่ว token ของ interaction (`redactPath`)
- **`numerology.json` ต้องอยู่ใน bundle** → `vercel.json` › `includeFiles`
- **pooler (Neon -pooler / Supabase 6543) ไม่รองรับ prepared statements** → `postgres(url, { prepare: false })` · migrate ใช้ตัว direct
- **RLS เปิดโดยไม่มี policy = Data API ปิด** โค้ดต่อตรงด้วย role เจ้าของตารางจึงข้ามได้ — ตั้งใจ
- **เทสห้ามแตะเครือข่าย** — `Env.schedule` override loader
- **scratchpad ไม่มี package.json/node_modules** → สคริปต์ที่ใช้ package ต้องอยู่ใน `scripts/`
- **WAF ขนส่ง (F5)** ปฏิเสธทุก UA ที่ไม่ใช่ browser → ผู้ใช้ใส่ file id เอง + stale detection
- **หน้าขนส่งมี iframe เก่าคอมเมนต์ทิ้ง** → ตัด `<!-- -->` ก่อนแกะ id
- **pdf.js แยก "8" กับ "ขจ"** → `ROW_RE` ใช้ `(\d)\s*([ก-ฮ]{1,3})`
- **stale ต้องไม่ตัด deadline reminder** · **key ของ match มี hash ของ wishlist**
- **webhook เคยหลุดเข้า `.env.example`** → เทส repo-hygiene · stage by name เท่านั้น
- **modal label > 45 ตัวอักษร** → "ไม่ตอบสนอง" · Discord ยืดปุ่มไม่ได้ → แถวเดียว ≤5 · Pin Messages เป็นสิทธิ์แยก
- **preview/check ต้องไม่โพสต์แผงซ้อน** → `afterSend` เฉพาะ cron/🔄
- **แก้ไฟล์ replace ทีละบล็อก** ไม่ slice ระหว่าง marker · python heredoc มีไทยใส่ `# -*- coding: utf-8 -*-`

---
📜 ประวัติเต็ม: `docs/WORKLOG.md` · 📐 กฎทั้งหมด: `CLAUDE.md`
