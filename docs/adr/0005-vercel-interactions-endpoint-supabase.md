# ADR-0005 · ย้าย bot ไป Vercel Interactions Endpoint + Supabase แทน gateway process บนเครื่อง

- สถานะ: ยอมรับ · 2026-09-20
- เกี่ยวข้อง: ADR-0001 (กรอบ "แจ้งเตือนอย่างเดียว" ยังอยู่ทุกข้อ) · ADR-0002 (เลิกข้อ "ไม่มีฐานข้อมูล") · ADR-0004 (**กลับคำ**เรื่อง Interactions Endpoint)

## บริบท

ADR-0004 เลือก gateway (discord.js) เพื่อให้มีปุ่ม และปัดทาง **Interactions Endpoint (HTTP)** ด้วยเหตุผลว่า
"ต้องมี public URL ให้ Discord ยิงกลับ ไม่เหมาะกับการรันบนเครื่องตัวเอง" — ถูกต้องในบริบทตอนนั้น
ที่ทุกอย่างรันบน Mac ของผู้ใช้

แต่ผลที่ตามมาคือ `npm run watch` เป็น process บนเครื่อง **ปิด Mac = bot ตาย ปุ่มไม่ตอบ และ cron 08:00/09:50 ไม่ทำงาน**
ผู้ใช้ต้องการให้ bot อยู่ตลอดโดยไม่มีค่าใช้จ่ายรายเดือน และยินดีลงแรงย้ายอีก 1 วัน

ข้อเท็จจริงที่เช็คจากเอกสารทางการ (2026-09-19):

- Discord ให้เลือกรับ interaction ได้สองทางที่ใช้แทนกันได้: gateway (WebSocket ค้าง) หรือ **Interactions Endpoint URL**
  (Discord POST มาที่ URL ของเรา · ต้องตรวจลายเซ็น Ed25519 ทุก request · ต้องตอบ `PING` ด้วย `PONG` ตอนบันทึก URL
  · ต้องตอบภายใน 3 วินาที แต่ตอบแบบ deferred แล้วตามด้วย follow-up ได้)
- **Vercel Cron แผน Hobby**: รันได้วันละครั้งต่อ job และคลาดได้ **±59 นาที** · ตรงนาทีต้อง Pro (20 USD/เดือน)
- Vercel Functions มี `waitUntil` ให้ทำงานต่อหลังส่ง response แล้ว — พอดีกับ deferred interaction

## การตัดสินใจ

**สถาปัตยกรรม**

| ส่วน | ที่อยู่ใหม่ |
|---|---|
| รับปุ่ม / modal / `/panel` | `api/interactions.ts` บน Vercel — ตรวจ Ed25519 → PING→PONG → route ตาม `custom_id` เหมือน `bot.ts` เดิม · ตอบ deferred ทันที แล้วทำงานต่อใน `waitUntil` และ PATCH `@original` |
| check 08:00 | `api/cron/check.ts` ยิงโดย **Vercel Cron** (คลาด ≤59 นาที ยังทันก่อน 10:00) |
| ปิง 09:50 | `api/cron/ping.ts` ยิงโดย **cron-job.org** (ฟรี ตรงนาที) — ทั้งสอง endpoint ป้องกันด้วย `Authorization: Bearer $CRON_SECRET` |
| ส่งข้อความ / แผง / ลบข้อความ | **Discord REST** ด้วย bot token (`src/notify/rest.ts`) — ไม่มี gateway ไม่มี discord.js |
| สถานะ | **Supabase Postgres** ผ่าน Drizzle (`src/db/`) · เลือกอัตโนมัติเมื่อมี `DATABASE_URL` ไม่มีก็ใช้ไฟล์ `.state/` เหมือนเดิม (`src/store.ts` เป็น adapter) |
| config ส่วนที่ปุ่มไม่แตะ | env `WATCH_CONFIG_JSON` (ทั้งไฟล์เป็น JSON) · `wishlist.numbers/exclude` ในนั้นถูกทับด้วยตาราง `wishlist` |

**ตาราง** (ทุกตารางเปิด RLS โดยไม่มี policy — ปิด Data API ของ Supabase ไว้ก่อน · โค้ดต่อผ่าน connection string โดยตรง)

| ตาราง | หน้าที่ | ทำไมแยก |
|---|---|---|
| `notified(key pk, at)` | กันแจ้งซ้ำ | insert-only · key เป็น pk → cron ชนกับคนกด 🔄 ก็ไม่แจ้งซ้ำ |
| `wishlist(number pk, kind want/exclude, owner_id, owner_name, added_at)` | เลขที่ปุ่มแก้ได้ + ใครเพิ่ม | เก็บ `owner_id` เพราะชื่อโชว์เปลี่ยนได้ |
| `meta(k pk, v jsonb)` | `lastScheduleVersion`, `panelMessageId`, `lastCheckAt` | ค่าเดี่ยวไม่กี่ตัว |
| `events(id, at, actor_id, actor_name, kind, payload jsonb)` | **transaction log** ทุกเหตุการณ์ที่ระบบทำหรือมีคนทำ · เก็บตลอด | แทน `watch.log` บนเครื่องที่ไม่มีอีกแล้ว · ปุ่ม 📜 อ่านจากตารางนี้ (คนในช่องเปิด Supabase ไม่ได้) |

**สิทธิ์:** ใครก็ได้ในช่องกดได้ (เหมือนเดิม) — bot ทำได้แค่แก้ wishlist กับลบข้อความของตัวเอง ไม่มีอะไรเสียหายถาวร
และ `events` บอกอยู่แล้วว่าใครทำ

**ตัดออก:** `src/notify/bot.ts`, dependency `discord.js`, คำสั่ง `watch`, `.github/workflows/daily-check.yml`
(ซ้ำกับ Vercel Cron) — CLI `schedule` / `match` / `check` / `preview` + webhook + state ไฟล์ **ยังอยู่**
เป็น fallback ถ้า Vercel ล่ม (`npm run check` ส่ง webhook ได้ทันที)

## ทางเลือกที่ไม่ได้เลือก

- **Railway / Fly.io** — ย้าย process ไปรันที่อื่นโดยไม่แก้โค้ด แต่มีค่าใช้จ่ายรายเดือน ผู้ใช้ต้องการของฟรีระยะยาว
- **GitHub Actions อย่างเดียว** — ปุ่มไม่มีที่รับ interaction · cron คลาดหลายนาที
- **Vercel Pro เพื่อ cron ตรงนาที** — 20 USD/เดือน แค่เพื่อปิง 09:50 · cron-job.org ทำได้ฟรี
- **เก็บ gateway ไว้คู่กับ Interactions Endpoint** — เท่ากับ route ปุ่มชุดเดียวกัน 2 implementation ที่ต้องแก้คู่กันทุกครั้งที่เพิ่มปุ่ม
- **state เป็น JSON ก้อนเดียวในตาราง** — read-modify-write ทั้งก้อน มี lost update เมื่อ cron ชนกับคนกดปุ่ม
- **ยุบ `notified` เข้า `events`** — เช็คซ้ำด้วย query บน jsonb แทน pk · ประหยัดตารางเดียวแต่ตรรกะกันซ้ำอ่อนลง
- **ตัดปุ่ม 📜 ประวัติ แล้วดูใน Supabase แทน** — dashboard เปิดได้แค่เจ้าของโปรเจกต์ แต่ wishlist เป็นของทั้งช่อง
  "เลขที่ผมเพิ่มหายไป ใครลบ?" ต้องตอบได้จากมือถือ

## ผลที่ตามมา

- ผู้ใช้ต้องมีบัญชี Vercel + Supabase (ฟรีทั้งคู่) และตั้ง **Interactions Endpoint URL** ใน Developer Portal
  · ขั้นตอนอยู่ใน README › โหมด Vercel
- secret เพิ่ม: `DISCORD_PUBLIC_KEY` (ตรวจลายเซ็น — ไม่ลับแต่ต้องตรง), `DATABASE_URL`, `CRON_SECRET` · `DISCORD_BOT_TOKEN` ยังเป็น secret เต็มตัว
- ไม่มี "ออนไลน์มา X นาที" บนแผงอีก (serverless ไม่มี uptime) → แสดง "เช็คล่าสุด" จาก `meta` แทน
- `/panel` ต้องลงทะเบียนเองครั้งเดียวด้วย `npm run register` (serverless ไม่มีตอน "เริ่ม" ให้ลงทะเบียน)
- ADR-0002 ข้อ "ไม่มีฐานข้อมูล" ถูกแทนที่ · ข้ออื่น (Node CLI, Zod, Vitest, ไม่มี framework หน้าจอ) ยังอยู่
- กฎเหล็กทั้งหมดของ ADR-0001/0003 ไม่เปลี่ยน: โค้ดยังแตะแค่ `drive.google.com` + `discord.com` (+ Supabase ของตัวเอง)
