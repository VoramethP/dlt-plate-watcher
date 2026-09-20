# 🔥 HOTCACHE

> อ่านไฟล์นี้หลัง `HANDOFF.md` · **ห้ามเกิน 500 คำ** (`wc -w`)
> Updated: **2026-09-20**

## โปรเจกต์นี้คืออะไร

Discord bot เฝ้าตาราง PDF เปิดจองเลขทะเบียนรถของขนส่งจาก Google Drive → เทียบ wishlist → แจ้งเตือน + landing panel มีปุ่ม · **แจ้งเตือนอย่างเดียว ไม่จองแทน** · public repo `VoramethP/dlt-plate-watcher`

## ตอนนี้อยู่ตรงไหน

**Phase 6 โค้ดเสร็จ (20 ก.ย. commit `90f2bdb`) — รอผู้ใช้ตั้ง Supabase / Vercel / Developer Portal แล้วทดสอบจริง**
bot รันบน Vercel Functions (`api/`): Interactions Endpoint + cron · state บน Supabase 4 ตาราง (`notified` `wishlist` `meta` `events`) · ADR-0005
ตัด gateway/discord.js/`watch`/daily-check.yml แล้ว · CLI `check` + webhook + `.state/` ยังเป็น fallback · 81 เทส · **ยังไม่เคย deploy จริง**

## กฎเหล็ก

1. ไม่จองแทน ไม่ล็อกอิน ThaID ไม่ยิงหน้าจอง ไม่เช็คว่าเลขถูกจองแล้ว (ADR-0001) — ผู้ใช้ยอมรับแล้ว อย่าเสนอทางอ้อม
2. ไม่ปลอม User-Agent ผ่าน WAF · โค้ดแตะแค่ drive.google.com + discord.com + Supabase ตัวเอง (ADR-0003)
3. ไม่มีข้อมูลส่วนบุคคลใน config/state/events (events เก็บแค่ Discord user id + ชื่อโชว์)
4. เลขศาสตร์ต้องมี source ต่อรายการ ห้ามแต่งเอง (`numerology.json` › sources)
5. migration ผ่าน `db:generate` + `db:migrate` เท่านั้น ห้าม `drizzle-kit push` · ห้ามแก้ตารางใน dashboard

## งานถัดไป

1. ผู้ใช้ทำตาม README › โหมด Vercel (Supabase → `db:migrate` → Vercel env → Interactions Endpoint URL → `npm run register` → cron-job.org 09:50) · เช็คลิสต์อยู่ใน `HANDOFF.md`
2. ทดสอบจริงบน Discord: `/panel` · ทุกปุ่ม · modal 3 ช่อง · `curl` cron/check · ดูตาราง `events`
3. จ. 21 ก.ย. `npm run schedule` → ยืนยัน ADR-0003 (file id คงที่?) แล้วบันทึกผล
4. ค่อยทำ: drawio หน้า 06 เพิ่มวิธี D (Vercel) · ปิด `watch` เก่าบน Mac (`pkill -f 'src/cli.ts watch'`) เมื่อของใหม่ขึ้นแล้ว
5. บั๊กจากผู้ใช้: ดู Vercel › Logs และตาราง `events` ก่อน · error ของ interaction ตอบกลับผู้กดแล้ว (`❌ bot พลาด: …`)

## กับดักที่เคยเจอ

- **Vercel Hobby cron: วันละครั้งต่อ job, คลาด ±59 นาที** → 09:50 ใช้ cron-job.org
- **ยังไม่ได้พิสูจน์ว่า Vercel build `api/*.ts` ที่ import `../src/*.js` (ESM + NodeNext) ได้** — ถ้า deploy พังตรงนี้ให้ดู `@vercel/node` + `"type":"module"` ก่อน
- **`numerology.json` ต้องอยู่ใน bundle** → `vercel.json` › `includeFiles` (readFile path สัมพัทธ์ nft ไม่ตาม)
- **Supabase pooler transaction mode (6543) ไม่รองรับ prepared statements** → `postgres(url, { prepare: false })` · migrate ใช้ 5432
- **RLS เปิดโดยไม่มี policy = Data API ปิด** โค้ดต่อตรงด้วย role เจ้าของตารางจึงข้าม RLS ได้ — ตั้งใจ
- **เทสห้ามแตะเครือข่าย** — `Env.schedule` override loader · เคยมีเทสยิง Drive จริงแล้วได้ 404
- **scratchpad ไม่มี package.json → tsx ตีความเป็น CJS** top-level await พัง → ใช้ `.mts`
- **WAF ขนส่ง (F5)** ตอบ "Request Rejected" ทุก UA ที่ไม่ใช่ browser → ผู้ใช้ใส่ file id เอง + stale detection
- **หน้าขนส่งมี iframe เก่าคอมเมนต์ทิ้ง** → `normalizeDriveFileId` ตัด `<!-- -->` ก่อน
- **pdf.js แยก "8" กับ "ขจ"** → `ROW_RE` ใช้ `(\d)\s*([ก-ฮ]{1,3})`
- **stale ต้องไม่ตัด deadline reminder** (เทสจับ)
- **key ของ match มี hash ของ wishlist** ไม่งั้นแก้ wishlist แล้วเงียบ
- **`cp example → watch.config.json` ทับของผู้ใช้** ห้ามทำอีก
- **webhook เคยหลุดเข้า `.env.example` + git add -A** → มีเทส repo-hygiene · stage by name เท่านั้น
- **modal label > 45 ตัวอักษร** → "ไม่ตอบสนอง" (เทสกันแล้ว)
- **Discord ยืดปุ่มไม่ได้** → แถวเดียว ≤5
- **Pin Messages เป็นสิทธิ์แยก** จาก Manage Messages
- **preview/check ต้องไม่โพสต์แผงซ้อน** → `afterSend` เฉพาะ cron/🔄
- **แก้ไฟล์ด้วย slice ระหว่าง marker** เคยลบฟังก์ชันทิ้ง → replace ทีละบล็อก
- **python heredoc มีไทย** ใส่ `# -*- coding: utf-8 -*-` · draw.io CLI นับหน้าจาก 1

---
📜 ประวัติเต็ม: `docs/WORKLOG.md` · 📐 กฎทั้งหมด: `CLAUDE.md`
