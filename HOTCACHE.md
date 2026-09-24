# 🔥 HOTCACHE

> อ่านไฟล์นี้หลัง `HANDOFF.md` · **ห้ามเกิน 500 คำ** (`wc -w`)
> Updated: **2026-09-24**

## โปรเจกต์นี้คืออะไร

Discord bot เฝ้าตาราง PDF เปิดจองเลขทะเบียนรถของขนส่งจาก Google Drive → เทียบ wishlist → แจ้งเตือน + landing panel มีปุ่ม · **แจ้งเตือนอย่างเดียว ไม่จองแทน** · public repo `VoramethP/dlt-plate-watcher`

## ตอนนี้อยู่ตรงไหน

**Phase 6 ขึ้นจริง · Vercel Cron ยืนยันแล้ว 21 ก.ย. 08:41** — `https://dlt-plate-watcher.vercel.app` · Interactions Endpoint + `/panel` + ทุกปุ่มผ่านบน Discord จริง · cron-job.org 09:50 · `watch` เก่าบน Mac ปิดแล้ว
**เลขประมูล 301 เลข/หมวด แยกช่อง 🔨 (ADR-0006)** · **การ์ดประจำวัน 📣 09:30 (กวาดห้องก่อนโพสต์ · `DAILY_SWEEP=all`) ลบเอง 23:50 (ADR-0007)** · ไม่มี Vercel Cron แล้ว
cron ทั้งหมดอยู่บน cron-job.org (09:30 daily · 09:50 ping · 23:50 clear) · state บน **Neon Postgres** (ย้ายจาก Supabase 21 ก.ย. · ADR-0005 › หมายเหตุ) 4 ตาราง `notified` `wishlist` `meta` `events` · CLI + webhook + `.state/` ยังเป็น fallback · 115 เทส
**push `main` = deploy production เอง** (Vercel ต่อ GitHub แล้ว) · env ใส่ผ่าน CLI ครบ 6 ตัว

## กฎเหล็ก

1. ไม่จองแทน ไม่ล็อกอิน ThaID ไม่ยิงหน้าจอง ไม่เช็คว่าเลขถูกจองแล้ว (ADR-0001) — ผู้ใช้ยอมรับแล้ว อย่าเสนอทางอ้อม
2. ไม่ปลอม User-Agent ผ่าน WAF · โค้ดแตะแค่ drive.google.com + discord.com + Supabase ตัวเอง (ADR-0003)
3. ไม่มีข้อมูลส่วนบุคคลใน config/state/events (events เก็บแค่ Discord user id + ชื่อโชว์)
4. เลขศาสตร์ต้องมี source ต่อรายการ ห้ามแต่งเอง (`numerology.json` › sources)
5. migration ผ่าน `db:generate` + `db:migrate` เท่านั้น ห้าม `drizzle-kit push` · ห้ามแก้ตารางใน dashboard
6. เลขประมูลมาจากประกาศฯ ผ่าน `npm run gen:auction` (ต้องครบ 301) ห้ามเดาเอง ห้ามถามระบบขนส่ง (ADR-0006)

## งานถัดไป

0. 🎉 **24 ก.ย. ผู้ใช้จองได้ `8ขช 5456`** (ต้องจดทะเบียนภายใน 26 ต.ค. — ผู้ใช้จดปฏิทินเอง)
1. **`8ขช 5456` บันทึกใน `meta.won` แล้ว** — จะเตือน 19 · 23 · 25 · 26 ต.ค. (`[7,3,1,0]`) · ดูว่ามาจริงไหมวันนั้น
2. **จ. 28 ก.ย.: ตารางสัปดาห์ใหม่เข้าระบบถูกไหม** (`schedule:` key ใหม่ + การ์ดอ้างหมวดใหม่)
3. ยังไม่สั่ง: ตัด `events` 90 วัน · เปลี่ยน pattern ที่ชนกลุ่มประมูล (แก้ทั้งไฟล์ + `WATCH_CONFIG_JSON`)
4. drawio หน้า 01–07 ยังเป็นภาพก่อนมีเลขประมูล/การ์ดประจำวัน
5. บั๊กจากผู้ใช้: ดูตาราง `events` ก่อน แล้ว `npx vercel logs dlt-plate-watcher.vercel.app` · error ของ interaction ตอบกลับผู้กดแล้ว

## กับดักที่เคยเจอ

- **Vercel Hobby cron คลาด ±59 นาที** → เวลาที่ต้องตรงอยู่บน cron-job.org ทั้งหมด
- **embed field ต้องนับตัวอักษรจริง ไม่ใช่จำนวนบรรทัด** — 📋 พังบน Discord จริงเพราะเลขศาสตร์ทำให้เกิน 1024 (`fitField`)
- **ข้อความเดียว: ทุก embed รวมกันห้ามเกิน 6000 ตัวอักษร** (ไม่ใช่แค่ 10 ใบ) → `chunkEmbeds` · ephemeral ยาวต่อด้วย `createFollowup`
- **error ที่ส่งกลับในช่องห้ามมี path `/webhooks/<app>/<token>`** — เคยรั่ว token ของ interaction (`redactPath`)
- **id ของ Discord 19 หลัก ห้ามผ่าน number** — `jsonb` parse สองรอบ (postgres-js + drizzle) → `getMeta` คืน id เพี้ยน ลบผิดใบ · อ่านด้วย `v #>> '{}'`
- **ลบข้อความถี่ ๆ โดน 429** → `discordRest` รอ `retry_after` ลองใหม่ 1 ครั้ง · ลบไม่ผ่านห้ามตอบว่าสำเร็จ
- **pooler ไม่รองรับ prepared statements** → `postgres(url, { prepare: false })` · migrate ใช้ตัว direct
- **scratchpad ไม่มี package.json/node_modules** → สคริปต์ที่ใช้ package ต้องอยู่ใน `scripts/`
- **stale ต้องไม่ตัด deadline reminder** · **ไฟล์ .json ท้ายรีโปต้องอยู่ใน `vercel.json › includeFiles`** · **modal label ≤45 ตัวอักษร ไม่งั้น "ไม่ตอบสนอง"**
- **webhook เคยหลุดเข้า `.env.example`** → เทส repo-hygiene · stage by name
- **"เลขสวย" ที่ตั้ง pattern = ชุดเดียวกับที่ขนส่งกันไว้ประมูล** — เลขตอง/คู่สลับจองไม่ได้ทั้งกลุ่ม · การ์ดบางลงคือถูกแล้ว
- **ปุ่มบนแผงครบ 10** — Discord รับ 5 แถว/ข้อความ · `panelRows()` ถอยกลับกลุ่มละแถวถ้าเกิน
- **แก้ไฟล์ replace ทีละบล็อก** · python heredoc มีไทยใส่ `# -*- coding: utf-8 -*-`

---
📜 ประวัติเต็ม: `docs/WORKLOG.md` · 📐 กฎทั้งหมด: `CLAUDE.md`
