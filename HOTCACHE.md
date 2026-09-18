# 🔥 HOTCACHE

> อ่านไฟล์นี้หลัง `HANDOFF.md` · **ห้ามเกิน 500 คำ** (`wc -w`)
> Updated: **2026-09-18**

## โปรเจกต์นี้คืออะไร

Discord bot (Node 22 + TS + discord.js) เฝ้าตาราง PDF เปิดจองเลขทะเบียนรถของขนส่งจาก Google Drive → เทียบ wishlist → แจ้งเตือน + landing panel มีปุ่ม · **แจ้งเตือนอย่างเดียว ไม่จองแทน** · public repo `VoramethP/dlt-plate-watcher`

## ตอนนี้อยู่ตรงไหน

**v0.3 ปิดงานแล้ว (ผู้ใช้ประกาศ 18 ก.ย.)** ทุกฟีเจอร์ทดสอบกับ Discord จริง · เทส 68 · เหลือแค่รอยืนยัน file id คงที่วันจันทร์ 21 ก.ย. และผู้ใช้เปิดสิทธิ์ Pin Messages เอง

## กฎเหล็ก

1. ไม่จองแทน ไม่ล็อกอิน ThaID ไม่ยิงหน้าจอง ไม่เช็คว่าเลขถูกจองแล้ว (ADR-0001) — ผู้ใช้ยอมรับแล้ว อย่าเสนอทางอ้อม
2. ไม่ปลอม User-Agent ผ่าน WAF · โค้ดแตะแค่ drive.google.com + discord.com (ADR-0003)
3. ไม่มีข้อมูลส่วนบุคคลใน config/state
4. เลขศาสตร์ต้องมี source ต่อรายการ ห้ามแต่งเอง (`numerology.json` › sources)

## งานถัดไป

1. จ. 21 ก.ย. 2569 `npm run schedule` → ยืนยัน ADR-0003 (file id คงที่?) แล้วบันทึกผล
2. ถ้ามีบั๊กจากผู้ใช้: ดู `.state/watch.log` ก่อน · error ของ interaction ตอบกลับผู้กดแล้ว (❌ bot พลาด: …)

## กับดักที่เคยเจอ

- **WAF ขนส่ง (F5)** ตอบ "Request Rejected" ทุก UA ที่ไม่ใช่ browser → ผู้ใช้ใส่ file id เอง + stale detection
- **หน้าขนส่งมี iframe เก่าคอมเมนต์ทิ้ง** → `normalizeDriveFileId` ตัด `<!-- -->` ก่อน
- **pdf.js แยก "8" กับ "ขจ"** → `ROW_RE` ใช้ `(\d)\s*([ก-ฮ]{1,3})`
- **stale ต้องไม่ตัด deadline reminder** (เทสจับ)
- **key ของ match มี hash ของ wishlist** ไม่งั้นแก้ wishlist แล้วเงียบ
- **`cp example → watch.config.json` ทับของผู้ใช้** ห้ามทำอีก
- **webhook เคยหลุดเข้า `.env.example` + git add -A** → rewrite history แล้ว · มีเทส repo-hygiene · ห้าม `git add -A` แบบไม่ดู
- **modal label > 45 ตัวอักษร** → "Invalid string length" → ผู้ใช้เห็น "ไม่ตอบสนอง" (เทสกันแล้ว)
- **Discord ยืดปุ่มไม่ได้** → แถวละ 2 ขอบไม่ตรง → ใช้แถวเดียว ≤5 · หน้าดีไซน์ต้องเลียนแบบข้อจำกัดนี้
- **Pin Messages เป็นสิทธิ์แยก** จาก Manage Messages
- **preview/check ต้องไม่โพสต์แผง** ซ้อนของ watch (`stickyPanel` เฉพาะ watch)
- **แก้ไฟล์ด้วย slice ระหว่าง marker** เคยลบ `guideEmbeds` ทิ้ง → replace ทีละบล็อก
- **python heredoc มีไทย** ใส่ `# -*- coding: utf-8 -*-` ไม่งั้น SyntaxError บางครั้ง
- **draw.io CLI v31 นับหน้าจาก 1** `-p 0` ให้หน้าแรกเงียบ ๆ · `-a` ไม่แยกไฟล์
- **Browser pane เปิด file:// ไม่ได้** → `python3 -m http.server 4173 --directory design`
- `digitSums` ตรงเยอะมาก → ตัวอย่างตั้ง `[]`

---
📜 ประวัติเต็ม: `docs/WORKLOG.md` · 📐 กฎทั้งหมด: `CLAUDE.md`
