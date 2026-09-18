# 🔥 HOTCACHE

> อ่านไฟล์นี้หลัง `HANDOFF.md` · **ห้ามเกิน 500 คำ** (`wc -w`)
> Updated: **2026-09-18**

## โปรเจกต์นี้คืออะไร

CLI (Node 22 + TS) โหลด PDF ตารางเปิดจองเลขทะเบียนของขนส่งจาก Google Drive → เทียบ wishlist → แจ้ง Discord webhook
แจ้งเตือนอย่างเดียว ไม่จองแทน จะเปิดเป็น public repo `VoramethP/dlt-plate-watcher`

## ตอนนี้อยู่ตรงไหน

**v0.3**: landing panel 🏠 (สถานะวันนี้ + wishlist + bot บนแผง · แถวทำ 4 ปุ่ม / แถวดู 5 ปุ่ม · sticky + /panel) · การ์ดแจ้งเตือนเหลือ 📤 แชร์ + 🌐 · ฟอร์มกรอกเลข 3 ช่อง (เพิ่ม/ไม่อยากได้/ลบ) · ทุกปุ่มทดสอบกับ Discord จริงแล้ว · 🔮 เลขศาสตร์จาก `numerology.json` รวบรวมจาก 6 แหล่งสาธารณะพร้อม citation ต่อรายการ (ผู้ใช้ไม่อยากได้ตารางแต่งเอง) · regenerate ด้วย `python3 scripts/gen-numerology.py` (ข้อมูลดิบที่ดึงจากแหล่งอยู่ในสคริปต์) **ทดสอบกับ Discord จริงแล้ว ปุ่มทำงานครบ** (bot = DLT Plate Watcher#7297 ช่อง #dlt-plate-watcher) · กำลังออกแบบการ์ดใหม่ที่ `design/embed-preview.html` (เปิดด้วย `python3 -m http.server 4173 --directory design`) ผู้ใช้จะปรับดีไซน์เองแล้วให้เอาไปใส่ `notify/discord.ts` · v0.1 ใช้งานได้จริงแล้ว ทดสอบกับ PDF จริงสัปดาห์ 14–18 ก.ย. 2569 อ่านได้ครบ 15 แถว · 26 เทสผ่าน · typecheck ผ่าน
ส่ง Discord จริงสำเร็จ · repo public ที่ github.com/VoramethP/dlt-plate-watcher (push แล้ว) · มี `drawio/` 8 หน้า + PNG · ยังไม่ได้: ยืนยันว่า file id คงที่ข้ามสัปดาห์

## กฎเหล็ก

1. ไม่จองแทน ไม่ล็อกอิน ThaID ไม่ยิงหน้าจอง (ADR-0001)
2. ไม่ปลอม User-Agent เพื่อผ่าน WAF ของขนส่ง · โค้ดแตะแค่ drive.google.com + discord.com (ADR-0003)
3. ไม่มี field ข้อมูลส่วนบุคคลใน config/state

## งานถัดไป

1. รอผู้ใช้ปรับ `design/embed-preview.html` (v2 การ์ดสรุป คือข้อเสนอ) → พอโอเค เอา `buildEmbed()` ของ variant ที่เลือกไปเขียนใน `src/notify/discord.ts` + อัปเดตเทส discord.test.ts · จำไว้: **title ของ embed ไม่รองรับ markdown**
2. หน้า 99 raw ของผู้ใช้ทำครบแล้ว (pattern อ่านง่าย + ปุ่ม 4 ปุ่ม) → ถ้าผู้ใช้วาดเพิ่ม export หน้าสุดท้าย (`-p 9`) มาดู
3. ผู้ใช้แก้ wishlist ให้เป็นเลขจริง (หรือกดปุ่ม 🔢 เพิ่มทีละเลข) + ตั้ง secrets บน GitHub ถ้าจะใช้ daily-check
4. จันทร์ 21 ก.ย. 2569 รัน `npm run schedule` เช็คว่า file id เดิมได้ตารางใหม่ไหม → บันทึกผลลง ADR-0003

## กับดักที่เคยเจอ

- **WAF ขนส่ง (F5) ตอบ "Request Rejected" (HTTP 200, 245 bytes)** ให้ทุก UA ที่ไม่ใช่ browser รวม `Mozilla/5.0 (compatible; …)` — มีแค่ `Mozilla/5.0` เปล่าที่ผ่าน เราเลือกไม่ใช้ (ADR-0003)
- **หน้าขนส่งมี iframe เก่าคอมเมนต์ทิ้งไว้** (`12IaFf…` → 404) ถ้า regex ไม่ตัด `<!-- -->` ก่อนจะได้ id ผิด · `normalizeDriveFileId` จัดการแล้ว
- **pdf.js แยก "8" กับ "ขจ" เป็นคนละ item** (font ต่างกัน) → `ROW_RE` ใช้ `(\d)\s*([ก-ฮ]{1,3})` ไม่นับ cell
- **หมายเหตุใน PDF เป็น merged cell 2 แถว** ("จดทะเบียนถึงเลข" / "8ขจ-1028") จึงตกไปอยู่ note ของ 2 แถวติดกัน · ยอมรับได้ ไม่ได้ใช้ note ตัดสินใจอะไร
- **stale ต้องไม่ตัด deadline reminder** — กำหนดจดทะเบียนอยู่ 1 เดือนหลังสัปดาห์เปิดจอง ตารางเก่าไปแล้วแต่เตือนยังต้องออก (เคยพลาด เทสจับได้)
- **webhook จริงเคยหลุดเข้า `.env.example` แล้วโดน `git add -A` ติดไป 2 commit** (18 ก.ย.) — rewrite history + gc แล้วก่อน push · ตอนนี้มีเทส repo-hygiene กันไว้ และห้าม `git add -A` โดยไม่ดู `git diff --cached -- '*.example*'`
- **key ของ match ต้องมี hash ของ wishlist** ไม่งั้นแก้ wishlist แล้วช่วงเดิมไม่แจ้งอีก (แก้แล้ว f9a50a4)
- **`cp watch.config.example.json watch.config.json` ทับของผู้ใช้ได้** — ห้ามทำอีกหลังผู้ใช้เริ่มแก้ (เคยทำ 18 ก.ย. ตอนนั้นยังเป็นค่าตัวอย่างอยู่)
- **draw.io CLI (v31) นับหน้าจาก 1** `-p 0` ไม่ error แต่ให้หน้าแรกเงียบ ๆ และ index เกินจะได้หน้าสุดท้าย → เคยได้ roadmap แทน raw · flag `-a` ไม่แยกไฟล์ ต้องวน `-p 1..8` (ดู `drawio/README.md`)
- `digitSums` ตรงเยอะมาก (ผลรวม 9/19/24 ในช่วง 2000 เลข = 200+ เลข) · ตัวอย่างจึงตั้งเป็น `[]`

---
📜 ประวัติเต็ม: `docs/WORKLOG.md` · 📐 กฎทั้งหมด: `CLAUDE.md`
