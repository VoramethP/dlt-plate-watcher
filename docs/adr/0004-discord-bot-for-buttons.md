# ADR-0004 · เพิ่ม Discord bot (gateway) เพื่อให้มีปุ่ม — webhook ยังอยู่เป็นทางเลือก

- สถานะ: ยอมรับ · 2026-09-18
- เกี่ยวข้อง: ADR-0001, ADR-0002

## บริบท

ผู้ใช้ร่างในหน้า "99 raw" ว่าอยากมีปุ่มใต้ข้อความแจ้งเตือน 4 ปุ่ม: กรอกเลขที่อยากจอง · ลบประวัติแชตเก่า · ดูประวัติแชต · เข้าสู่เว็บไซต์
Discord ไม่ให้ webhook ธรรมดาส่ง component (ปุ่ม) และการกดปุ่มเป็น interaction ที่ต้องมี "application" มารับ
ดังนั้นปุ่มใด ๆ นอกจากลิงก์ = ต้องเป็น bot

## การตัดสินใจ

- เพิ่มโหมด **bot** ด้วย `discord.js` (gateway, intent แค่ `Guilds` ไม่ต้องขอ privileged intent)
  เปิดใช้เมื่อมี `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` ใน `.env` · ไม่มี → ใช้ webhook เหมือนเดิม
- ปุ่มและความหมาย (ทั้งหมดอยู่ในกรอบ ADR-0001):

  | ปุ่ม | ทำอะไร | ไม่ทำอะไร |
  |---|---|---|
  | กรอกเลขที่อยากจอง | เปิด modal รับเลข 1–9999 → เพิ่มลง `wishlist.numbers` ใน `watch.config.json` | **ไม่จอง** แค่เฝ้าให้ |
  | ดูประวัติแชต | ตอบแบบ ephemeral ว่าเคยแจ้งอะไรไปบ้าง (จาก `.state/`) | — |
  | ลบประวัติแชตเก่า | ลบข้อความเก่าของ bot เองในช่องนี้ | ไม่ลบข้อความของคนอื่น |
  | เข้าสู่เว็บไซต์ | ปุ่มลิงก์ไปหน้าจองของขนส่ง | ไม่ยิง request ใด ๆ ไปหาเว็บขนส่ง |

- ปุ่มตอบสนองได้เฉพาะตอน process `watch` รันอยู่ (bot online) · `check` แบบ cron ส่งข้อความพร้อมปุ่มได้ แต่ปุ่มจะ "รอ" จนกว่า watch จะออนไลน์
- โค้ดที่แตะ discord.js อยู่ใน `src/notify/bot.ts` ไฟล์เดียว · ตรรกะของปุ่ม (แก้ config, จัดรูปประวัติ) อยู่ใน `src/notify/actions.ts` แบบ pure เพื่อเทสได้โดยไม่ต้องต่อ Discord

## ทางเลือกที่ไม่ได้เลือก

- **Interactions endpoint (HTTP)** — ต้องมี public URL ให้ Discord ยิงกลับ ไม่เหมาะกับการรันบนเครื่องตัวเอง
- **Slash command แทนปุ่ม** — ผู้ใช้อยากได้ปุ่มใต้ข้อความชัดเจน · slash command เพิ่มทีหลังได้บนโครงเดียวกัน
- **ทำเฉพาะปุ่มลิงก์** — webhook ธรรมดาก็ส่งไม่ได้อยู่ดี (ต้องเป็น application-owned webhook)

## ผลที่ตามมา

- ผู้ใช้ต้องสร้าง Discord application + bot token เอง และเชิญ bot เข้า server พร้อมสิทธิ์ Send Messages · Embed Links · Read Message History · Manage Messages
- bot token เป็น secret ระดับเดียวกับ webhook — อยู่ใน `.env` เท่านั้น (เทส repo-hygiene ตรวจไฟล์ example)
- dependency ใหญ่ขึ้น (discord.js) แต่จำกัดอยู่ไฟล์เดียว
