# 🔥 HOTCACHE

> อ่านไฟล์นี้หลัง `HANDOFF.md` · **ห้ามเกิน 500 คำ** (`wc -w`)
> Updated: **2026-09-21**

## โปรเจกต์นี้คืออะไร

Discord bot เฝ้าตาราง PDF เปิดจองเลขทะเบียนรถของขนส่งจาก Google Drive → เทียบ wishlist → แจ้งเตือน + landing panel มีปุ่ม · **แจ้งเตือนอย่างเดียว ไม่จองแทน** · public repo `VoramethP/dlt-plate-watcher`

## ตอนนี้อยู่ตรงไหน

**Phase 6 ขึ้นจริง · Vercel Cron ยืนยันแล้ว 21 ก.ย. 08:41** — `https://dlt-plate-watcher.vercel.app` · Interactions Endpoint + `/panel` + ทุกปุ่มผ่านบน Discord จริง · cron-job.org 09:50 · `watch` เก่าบน Mac ปิดแล้ว
**เลขประมูล 301 เลข/หมวด แยกช่อง 🔨 (ADR-0006)** · **การ์ดประจำวัน 📣 09:30 (กวาดห้องก่อนโพสต์ · `DAILY_SWEEP=all`) ลบเอง 23:50 (ADR-0007)** · ไม่มี Vercel Cron แล้ว
state บน **Neon Postgres** (ย้ายจาก Supabase 21 ก.ย. · ADR-0005 › หมายเหตุ) 4 ตาราง `notified` `wishlist` `meta` `events` · CLI + webhook + `.state/` ยังเป็น fallback · 89 เทส
**push `main` = deploy production เอง** (Vercel ต่อ GitHub แล้ว) · env ใส่ผ่าน CLI ครบ 6 ตัว

## กฎเหล็ก

1. ไม่จองแทน ไม่ล็อกอิน ThaID ไม่ยิงหน้าจอง ไม่เช็คว่าเลขถูกจองแล้ว (ADR-0001) — ผู้ใช้ยอมรับแล้ว อย่าเสนอทางอ้อม
2. ไม่ปลอม User-Agent ผ่าน WAF · โค้ดแตะแค่ drive.google.com + discord.com + Supabase ตัวเอง (ADR-0003)
3. ไม่มีข้อมูลส่วนบุคคลใน config/state/events (events เก็บแค่ Discord user id + ชื่อโชว์)
4. เลขศาสตร์ต้องมี source ต่อรายการ ห้ามแต่งเอง (`numerology.json` › sources)
5. migration ผ่าน `db:generate` + `db:migrate` เท่านั้น ห้าม `drizzle-kit push` · ห้ามแก้ตารางใน dashboard
6. เลขประมูลมาจากประกาศฯ ผ่าน `npm run gen:auction` (ต้องครบ 301) ห้ามเดาเอง ห้ามถามระบบขนส่ง (ADR-0006)

## งานถัดไป

1. **ผู้ใช้ต้องแก้ cron-job.org**: job 09:30 → `/api/cron/daily` (จากเดิม `/api/cron/check`) + เพิ่ม job 23:50 → `/api/cron/daily-clear`
2. พรุ่งนี้เช้าดูว่าการ์ดประจำวันโผล่จริงตอน 09:30 และหายตอน 23:50 (`events` kind `daily`)
3. ค่อยทำ: drawio หน้า 06 เพิ่มวิธี D (Vercel) · หน้า 01–07 ยังเป็นภาพก่อนมีการ์ดประจำวัน
3. บั๊กจากผู้ใช้: ดู Vercel › Logs (`npx vercel logs dlt-plate-watcher.vercel.app`) และตาราง `events` ใน Neon ก่อน · error ของ interaction ตอบกลับผู้กดแล้ว (`❌ bot พลาด: …`)

## กับดักที่เคยเจอ

- **Vercel Hobby cron: วันละครั้งต่อ job, คลาด ±59 นาที** → เวลาที่ต้องตรงอยู่บน cron-job.org ทั้งหมด (09:30 daily · 09:50 ping · 23:50 daily-clear)
- **Vercel ไม่มี framework ต้องมี `public/`** ไม่งั้น "No Output Directory" · `vercel link` เขียน `.env*` ลง .gitignore (กลบ .env.example) → แก้เป็น `.env.local`
- **embed field ต้องนับตัวอักษรจริง ไม่ใช่จำนวนบรรทัด** — 📋 พังบน Discord จริงเพราะเลขศาสตร์ทำให้เกิน 1024 (`fitField`)
- **ข้อความเดียว: ทุก embed รวมกันห้ามเกิน 6000 ตัวอักษร** (ไม่ใช่แค่ 10 ใบ) — ตารางรอบใหม่ 5 วัน = 6230 → 400 · แบ่งด้วย `chunkEmbeds` · ephemeral ที่ยาวต่อด้วย `createFollowup`
- **error ที่ส่งกลับในช่องห้ามมี path `/webhooks/<app>/<token>`** — เคยรั่ว token ของ interaction (`redactPath`)
- **id ของ Discord 19 หลัก ห้ามผ่าน number** — `jsonb` โดน parse สองรอบ (postgres-js + drizzle) ทำให้ `getMeta` คืน id เพี้ยน ลบข้อความผิดใบ → อ่านด้วย `v #>> '{}'`
- **ลบข้อความถี่ ๆ โดน 429** → `discordRest` รอ `retry_after` ลองใหม่ 1 ครั้ง · ลบไม่ผ่านห้ามตอบว่าสำเร็จ
- **pooler ไม่รองรับ prepared statements** → `postgres(url, { prepare: false })` · migrate ใช้ตัว direct
- **scratchpad ไม่มี package.json/node_modules** → สคริปต์ที่ใช้ package ต้องอยู่ใน `scripts/`
- **pdf.js แยก "8" กับ "ขจ"** → `ROW_RE` ใช้ `(\d)\s*([ก-ฮ]{1,3})`
- **stale ต้องไม่ตัด deadline reminder** · **ไฟล์ .json ท้ายรีโปต้องอยู่ใน `vercel.json › includeFiles`** · **modal label ≤45 ตัวอักษร ไม่งั้น "ไม่ตอบสนอง"**
- **webhook เคยหลุดเข้า `.env.example`** → เทส repo-hygiene · stage by name เท่านั้น
- **"เลขสวย" ที่ผู้ใช้ตั้ง pattern = ชุดเดียวกับที่ขนส่งกันไว้ประมูล** — เลขตอง/คู่สลับทั้งกลุ่มจองออนไลน์ไม่ได้ · การ์ดบางลงคือถูกแล้ว
- **แก้ไฟล์ replace ทีละบล็อก** ไม่ slice ระหว่าง marker · python heredoc มีไทยใส่ `# -*- coding: utf-8 -*-`

---
📜 ประวัติเต็ม: `docs/WORKLOG.md` · 📐 กฎทั้งหมด: `CLAUDE.md`
