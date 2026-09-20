# HANDOFF

> **เขียนทับทั้งไฟล์ทุกครั้งที่ส่งมอบ** ไม่ต่อท้าย — ไฟล์นี้คือ "ไม้ที่กำลังส่ง" ไม่ใช่ประวัติ
> ส่งมอบเมื่อ: 2026-09-20 · เหตุผล: ผู้ใช้ตัดสินใจเริ่ม **Phase 6 — ย้าย bot ขึ้น Vercel + Supabase** เซสชันเดิม context เต็ม (context-checker 🔴) จึงส่งไม้ก่อนลงมือ

## ทำอะไรไปในเซสชันนี้

- v0.3 ปิดงานแล้ว (18 ก.ย.) ทุกปุ่มทดสอบกับ Discord จริง · บทเรียนถูก ingest เข้า brain (`Framework Skills`) เป็น 12 หน้า + skill 3 ตัว (`discord-bot`, `repo-hygiene`, `drawio-from-code`) และ brainpush แล้ว
- ผู้ใช้ถามว่า "ปิด Mac แล้ว bot ตายไหม" → ใช่ เพราะ `npm run watch` เป็น process บนเครื่อง → ผู้ใช้เลือก **Vercel + Supabase** เพราะอยากได้ของฟรีระยะยาวและยินดีลงแรงอีก 1 วัน

## สถานะ ณ ตอนส่ง

- **working tree:** สะอาด · push แล้ว · commit ล่าสุด `801855a` (numerology) + handoff นี้
- **เทส:** 68/68 ผ่าน · typecheck ผ่าน
- **bot บน Mac:** อาจยังรันอยู่เบื้องหลัง (`pgrep -fl 'src/cli.ts watch'`) หยุดด้วย `pkill -f 'src/cli.ts watch'` เมื่อของใหม่ขึ้นแล้ว

## ค้างอยู่ตรงไหน

ยังไม่ได้เริ่มเขียนโค้ด Phase 6 เลย — มีแต่การตัดสินใจและข้อเท็จจริงที่หาไว้ (ด้านล่าง)

## ทำต่อยังไง — Phase 6 (เปิดแชตใหม่ในโฟลเดอร์นี้)

1. `/grill-me` สั้น ๆ 1 รอบเรื่อง: จะเก็บ wishlist/state ใน Supabase ตารางอะไร · ใครกดปุ่มได้บ้าง · ยังต้องมีโหมดรันบนเครื่องไหม (แนะนำ: คงไว้เป็น fallback)
2. เขียน **ADR-0005** "Vercel Interactions Endpoint + Supabase แทน gateway process" อ้างข้อเท็จจริงด้านล่าง
3. โครงที่แนะนำ (คง `actions.ts`, `discord.ts` embed builders, `match.ts`, `numerology.ts`, parser ไว้ทั้งหมด):
   - `api/interactions.ts` — ตรวจลายเซ็น Ed25519 (`X-Signature-Ed25519`, `X-Signature-Timestamp`) → PING→PONG → route ตาม `custom_id`/modal/slash เหมือน `bot.ts` เดิม · ตอบใน 3 วิ (deferred + follow-up ผ่าน REST เมื่อต้องโหลด PDF)
   - `api/cron/check.ts` (08:00) และ `api/cron/ping.ts` (09:50) — ป้องกันด้วย `CRON_SECRET`
   - ส่งข้อความ/ลบแผง/โพสต์แผงผ่าน **Discord REST** ด้วย bot token (ไม่ต้อง gateway)
   - `src/state.ts` → adapter: ไฟล์ (โหมด local) หรือ **Supabase** (โหมด Vercel): ตาราง `notified(key, at)`, `wishlist(number, owner, kind add|exclude)`, `meta(k, v)` — ใช้ Drizzle ตามสแต็กกลาง
   - `watch.config.json` ส่วน patterns/vehicleType อยู่ใน env หรือตาราง `meta` · numerology.json bundle ไปกับโค้ด
4. ตั้งค่า: Discord Developer Portal → **Interactions Endpoint URL** = `https://<app>.vercel.app/api/interactions` (ต้องผ่าน PING ตอนบันทึก) · Vercel env: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_CHANNEL_ID`, `SUPABASE_*`, `CRON_SECRET`
5. cron 09:50 ใช้ **cron-job.org** (ฟรี ตรงนาที) ยิง `api/cron/ping` · cron 08:00 ใช้ Vercel Cron ได้ (Hobby คลาด ≤59 นาที ยังทันก่อน 10:00)
6. ทดสอบจริง: กดทุกปุ่มบน Discord · `/panel` · modal 3 ช่อง · แผง sticky หลัง cron
7. อัปเดต README (โหมด Vercel), UI-GUIDE, drawio หน้า 06 (เพิ่มวิธี D) · ปิด watch บน Mac

## สิ่งที่ตกลงกันไว้แต่ยังไม่ได้เขียนลงไฟล์ไหน

- **ข้อเท็จจริงที่เช็คแล้ว 2026-09-19** (เอกสารทางการ): Discord Interactions Endpoint กับ Gateway เป็นทางเลือกที่ใช้แทนกันได้ ไม่ต้องมี WebSocket ค้าง ต้องตรวจ Ed25519 ทุก request และตอบ PING ด้วย PONG · Vercel Cron แผน Hobby: 100 job/project แต่ **รันได้วันละครั้งต่อ job และคลาดได้ ±59 นาที** · Pro ตรงนาที (20 USD/เดือน) → จึงใช้ตัวตั้งเวลาภายนอกสำหรับ 09:50
- ผู้ใช้เลือก Vercel + Supabase เพราะ "อยากได้ของฟรีระยะยาวและยินดีลงแรงอีกวัน" — ไม่ใช่ Railway/Fly แม้จะไม่ต้องแก้โค้ด
- ADR-0004 เคยตัดทาง Interactions Endpoint ด้วยเหตุผล "ต้องมี public URL ไม่เหมาะกับรันบนเครื่อง" — ADR-0005 ต้องอ้างและกลับคำในบริบทใหม่ ไม่ใช่ลบทิ้ง
- กฎเหล็กเดิมทั้งหมดยังอยู่: ไม่จองแทน ไม่ล็อกอิน ThaID ไม่ยิงเว็บขนส่ง ไม่ปลอม UA · เลขศาสตร์ต้องมี source · stage by name ห้าม `git add -A`
- โปรเจกต์นี้ยังไม่มี `.claude/skills/` ของตัวเอง — skill `discord-bot`, `repo-hygiene`, `stack-setup` อยู่ระดับผู้ใช้แล้ว โหลดได้เลย (ใช้ `stack-setup` เฉพาะส่วน Supabase + Drizzle ไม่ต้อง Nuxt)

## เกณฑ์ว่าไม้นี้ส่งได้จริง
เปิดแชตใหม่ อ่านไฟล์นี้ + `HOTCACHE.md` แล้วเริ่มข้อ 1 ได้ทันทีโดยไม่ต้องถามว่าทำไมถึงไป Vercel และติดอะไรบ้าง
