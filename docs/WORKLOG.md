# WORKLOG

ความจำระยะยาวของโปรเจกต์ — **ต่อท้ายอย่างเดียว ห้ามแก้ของเก่า**
รายการใหม่ไปต่อท้าย **ก่อน** หัวข้อ "งานถัดไป" เสมอ

---

## [2026-09-18] เริ่มโปรเจกต์ · สำรวจระบบขนส่ง · v0.1 ใช้งานได้

**ทำอะไร:**

- สำรวจ reserve.dlt.go.th ด้วยเบราว์เซอร์: หน้าแรก / `?menu=schedule` / `?menu=resv_m` · อ่านประกาศและรูป `ruleZ.jpg`
- พบว่า (1) ทุกการจองต้องยืนยันตัวตนผ่าน ThaID ตั้งแต่ 1 มิ.ย. 2566 (2) เปิดจอง 10:00–16:00 ตามตาราง
  (3) ตารางเป็น PDF บน Google Drive ฝังผ่าน iframe (4) เว็บอยู่หลัง Incapsula + F5 TSPD
  (5) นอกเวลา หน้าจองขึ้น "ปิดระบบจองเลข" (6) ประกาศห้ามนำเลขไปจำหน่ายจ่ายโอน ผู้จองต้องเป็นเจ้าของรถ
- เขียน v0.1: fetch (Drive) · parse (pdf.js ผ่าน `unpdf`) · match · state · discord · cli 4 คำสั่ง · 26 เทส · CI + daily-check workflow
- ทดสอบ live: `schedule` อ่าน PDF จริงได้ครบ 15 แถว 3 ประเภทรถ · `check --dry-run` สร้าง embed ถูกต้อง

**ทำไมถึงเลือกแบบนี้:**

- **แจ้งเตือนแทนจอง** (ADR-0001): ผู้ใช้ถามมาว่า "ทำ agent กดจอง" — ตอบว่าทำไม่ได้และไม่ควรทำ เพราะต้องล็อกอินแทน + แข่งกับประชาชน + หลบบอต · ผู้ใช้ตกลงแนวทางแจ้งเตือนผ่าน Discord
- **ไม่ปลอม UA** (ADR-0003): ทดสอบแล้ว WAF ปฏิเสธทุก UA ที่ไม่ใช่ browser · เลือกให้ผู้ใช้ใส่ file id เอง + stale detection แทน
- **Last-Modified เป็นเวอร์ชัน**: ไฟล์บน Drive ชื่อ `number_v2.pdf`, Last-Modified = จันทร์ 14 ก.ย. 08:58 ไทย = เช้าวันแรกของตาราง → ขนส่งอัปโหลดทับไฟล์เดิม เทียบ file id จะไม่เห็นการเปลี่ยน
- **Node CLI ไม่ใช่ Nuxt** (ADR-0002): ไม่มี UI/DB/ผู้ใช้หลายคน
- **webhook ไม่ใช่ bot**: ไม่ต้องรับข้อความขาเข้า ตั้งง่ายกว่ามาก

**ทางเลือกที่ไม่ได้เลือก และเพราะอะไร:**

- ดึงหน้าขนส่งด้วย `Mozilla/5.0` — ผ่าน WAF ได้ แต่คือการหลบมาตรการของเจ้าของระบบ
- ฟีเจอร์เช็ค "ระบบเปิดหรือยัง" จากหน้าจอง — ต้องยิงหน้าจอง ตัดออก ใช้ปิงตามเวลาแทน
- `pdftotext` (poppler) — อ่านดีมาก แต่ต้องลงโปรแกรมเพิ่ม รันบน Actions ยุ่ง · pdf.js ให้พิกัดมาจัดบรรทัดเองได้พอ

**ผลที่ตามมา / สิ่งที่ต้องระวังต่อไป:**

- สมมติฐาน "file id คงที่" ยังไม่ยืนยัน ต้องดูสัปดาห์หน้า
- ถ้าขนส่งเปลี่ยน layout PDF `ROW_RE` จะไม่จับและ parser จะ throw — ตั้งใจให้พังดัง
- daily-check บน GitHub Actions เก็บ state ผ่าน actions/cache ซึ่งหมดอายุใน 7 วันถ้าไม่ถูกใช้ — ถ้า workflow หยุดไปนานอาจแจ้งซ้ำหนึ่งรอบ ยอมรับได้

## [2026-09-18] ยิง Discord จริงครั้งแรก · แก้ key ของ match

**ทำอะไร:** ผู้ใช้ใส่ webhook ใน `.env` แล้ว `npm run check` ส่งสำเร็จ 1 รายการ (match ศุกร์ 18 ก.ย. 8ขฉ 5001–6500 จาก wishlist ตัวอย่าง)
พบระหว่างนั้นว่า key `match:date:prefix:range` ไม่ผูกกับ wishlist → แก้ wishlist แล้วช่วงเดิมจะเงียบ จึงต่อ hash ของ wishlist ท้าย key (f9a50a4) + เทส

**ทำไม:** state มีไว้กันสแปม ไม่ใช่กันข้อมูลใหม่ · เมื่อเงื่อนไขเปลี่ยน ผลเปลี่ยน ต้องถือเป็นเรื่องใหม่

## [2026-09-18] เปิด public · ล้าง webhook หลุด · drawio 8 หน้า

**ทำอะไร:** ผู้ใช้เผลอวาง webhook จริงใน `.env.example` แล้วผม `git add -A` ติดไป 2 commit → rewrite history + `gc --prune` ก่อน push · เพิ่มเทส repo-hygiene · `gh repo create --public --push` · สร้าง `drawio/dlt-plate-watcher.drawio` 8 หน้า (ภาพรวม / check / planNotifications / parser / watch / deploy / roadmap / 99 raw) จาก generator Python แล้ว export PNG ด้วย draw.io desktop CLI

**ทำไม:** ผู้ใช้อยากได้ flow ทั้งหมดแยกหน้าไว้ประดับ repo และหน้า "raw" ไว้ร่างเองให้ Claude อ่านง่าย (ไม่ใช่โฟลเดอร์ raw — เคยเข้าใจผิด) · เขียน generator แทน XML มือ เพราะแก้ layout ซ้ำหลายรอบ

**ทางเลือกที่ไม่ได้เลือก:** skill diagram-design (ให้ HTML/SVG ไม่ใช่ .drawio ที่แก้ใน draw.io ได้)

**ระวังต่อไป:** ผู้ใช้บอกว่างานถัดไปคือ UI + ปุ่ม — ยังไม่นิยาม ต้อง grill ก่อน (ดู HOTCACHE)

## [2026-09-18] อ่านหน้า 99 raw → embed ใหม่ + โหมด bot 4 ปุ่ม

**ทำอะไร:** ผู้ใช้ร่างในหน้า 99 raw 2 เรื่อง (1) ส่วน "เลขที่ตรงเงื่อนไข" อ่าน regex ไม่รู้เรื่อง → pattern ตั้งชื่อได้ `{name, regex}` และ embed จัดกลุ่ม 1 field ต่อเหตุผล เรียง 5 เลขต่อแถว ตัดที่ 1024 ตัวอักษร + คำสั่ง `preview` (2) ปุ่ม 4 ปุ่มใต้ข้อความ → เพิ่ม `Notifier` interface, `bot.ts` (discord.js gateway, intent Guilds), `actions.ts` (pure) · watch โหลด config ใหม่ทุกรอบเพราะปุ่มแก้ไฟล์ได้ · เพิ่มหน้า 08 ใน drawio (แทรก XML ไม่ regenerate เพื่อไม่ทับที่ผู้ใช้วาด) · 37 เทส

**ทำไม:** webhook ส่งปุ่มไม่ได้และรับ interaction ไม่ได้ → ต้องเป็น bot (ADR-0004) แต่คง webhook ไว้เป็นทางที่ตั้งง่ายสุด · ปุ่ม "กรอกเลขที่อยากจอง" ตีความว่า "เพิ่มลง wishlist" ไม่ใช่จอง ตาม ADR-0001

**ยังไม่ได้ทำ/ทดสอบ:** ยังไม่มี bot token จริง จึงทดสอบได้แค่ typecheck + เทส pure + dry-run · การลบข้อความและ modal ต้องลองกับ Discord จริง

## [2026-09-18] bot ใช้จริงได้ · เริ่มออกแบบการ์ดใหม่ใน HTML

**ทำอะไร:** ผู้ใช้สร้าง bot เอง (สอนทีละขั้น) · watch รันเบื้องหลัง ปุ่มทั้ง 4 ทำงาน · ผู้ใช้ขอดีไซน์การ์ดใหม่แบบ HTML กดเล่นได้เพื่อปรับเอง → `design/embed-preview.html` มี 3 variant (v1 ปัจจุบัน / v2 การ์ดสรุป / v3 กระชับ) × 6 ประเภทข้อความ + ตัวเลือก + จำลองปุ่ม/modal/ephemeral + แสดง embed JSON ที่จะส่งจริง

**ทำไมทำแบบนี้:** render จาก embed JSON ไม่ใช่วาด HTML อิสระ เพื่อบังคับให้ดีไซน์อยู่ในข้อจำกัดของ Discord (title ไม่มี markdown, inline field 3 ช่อง, 1024/6000 ตัวอักษร) — สิ่งที่เห็นในหน้า = สิ่งที่ Discord จะได้

**ระวัง:** Browser pane เปิด file:// ไม่ได้ และ launch.json ใน repo ไม่ถูกอ่านเมื่อ session เริ่มจาก scratch → ใช้ `python3 -m http.server` แล้ว preview ด้วย url แทน

## [2026-09-18] จากปุ่ม 4 ปุ่ม → landing panel

**ทำอะไร:** ไล่ตาม feedback ผู้ใช้ทีละข้อ: ฟอร์มหลายเลข + ช่องลบ + ช่องไม่อยากได้ (exclude ตัดออกจากทุกรูปแบบ) · 📋 เลขที่เฝ้าอยู่ · 💡 เตือนเลขที่ pattern ครอบ · 📤 แชร์เลขเป็น code block (Discord มีปุ่มคัดลอกในตัว) · ปุ่มลัดคำสั่งตอบเป็น embed · สุดท้ายรวมทุกอย่างเป็น **landing panel** อันเดียวล่างสุด (headline สถานะวันนี้ · wishlist ย่อ · bot · ตาราง + 2 แถวปุ่ม) การ์ดแจ้งเตือนเหลือ 2 ปุ่ม

**บทเรียนที่แลกมาด้วยเวลา:**
- modal label > 45 ตัวอักษร → discord.js โยน "Invalid string length" → ผู้ใช้เห็นแค่ "ไม่ตอบสนอง" → มีเทสลิมิตแล้ว
- Discord ยืดปุ่มเต็มแถวไม่ได้ → 2×2 ขอบไม่ตรง → หน้าดีไซน์ต้องเลียนแบบข้อจำกัดนี้ด้วย ไม่งั้นหลอกตา
- Pin Messages เป็นสิทธิ์แยกจาก Manage Messages (ผู้ใช้ยังไม่เปิด → ปักหมุดไม่ได้ ไม่กระทบอย่างอื่น)
- คำสั่งครั้งเดียว (preview/check) ต้องไม่โพสต์แผงซ้อนของ watch (stickyPanel เฉพาะ watch)
- แก้ไฟล์ด้วย slice ระหว่าง marker → เผลอลบฟังก์ชันที่อยู่ระหว่างกลาง (guideEmbeds) กู้จาก git ได้ แต่ควร replace ทีละบล็อก

## [2026-09-18] เลขศาสตร์จากแหล่งจริง · ปิดงาน v0.3

**ทำอะไร:** ผู้ใช้ปฏิเสธตารางเลขศาสตร์ที่แต่งเอง ("ไม่ต่างกับหลอกลวง") → ค้นเว็บ 6 แหล่ง (Sanook, Autospinn ×2, TQM, ทะเบียนดี, Berded) ดึงตารางค่าตัวอักษร (3 แหล่งตรงกันทุกตัว) ผลรวมดีมาก/ดี/ไม่ดี (2 แหล่ง) คู่เลข 4 กลุ่ม + ควรเลี่ยง → `scripts/gen-numerology.py` สร้าง `numerology.json` ที่มี `pairSources`/`sumGrades[].sources` ต่อรายการ · bot บอก "N แหล่งตรงกัน" และ "บางแหล่งเห็นต่าง" · ชิปเลขตัดหมวดซ้ำ คั่นด้วย · · ผู้ใช้ประกาศปิดงาน

**ทำไม:** ความเชื่อพิสูจน์ไม่ได้ แต่ "ที่มา" ตรวจได้ — เก็บ citation ต่อรายการเป็นสิ่งเดียวที่ทำให้ตารางนี้ซื่อสัตย์ · ใช้ชื่อหมวดของแหล่งแทน 3 สายที่คุยกัน เพราะแหล่งไม่ได้แบ่งแบบนั้น

**ผลที่ตามมา:** เพิ่มรายการใหม่ต้องมี source · แหล่งเป็นเว็บรถ/ประกัน/ขายทะเบียน ไม่ใช่ตำราต้นฉบับ (บอกผู้ใช้แล้ว)

## [2026-09-20] ตัดสินใจเริ่ม Phase 6 — Vercel + Supabase (ยังไม่ลงมือ)

**ทำอะไร:** ผู้ใช้เพิ่งรู้ว่า `npm run watch` คือ process บน Mac ปิดเครื่อง = bot ตาย · เสนอ 3 ทาง (Actions อย่างเดียว / Railway·Fly ไม่แก้โค้ด / Vercel+Supabase แก้ชั้น bot) · เช็คเอกสารจริง: Discord Interactions Endpoint แทน gateway ได้ ไม่ต้องมี process ค้าง · Vercel Cron Hobby รันวันละครั้ง คลาด ±59 นาที · ผู้ใช้เลือก **Vercel + Supabase** ("ของฟรีระยะยาว ยินดีลงแรงอีกวัน") · context-checker 🔴 → handoff ก่อนเริ่ม

**ทำไม:** งานใหญ่ต้องเริ่มด้วย context โล่ง · ข้อเท็จจริงที่หาไว้ต้องลงไฟล์ก่อนหาย (อยู่ใน HANDOFF › สิ่งที่ตกลงกันไว้)

**ทางเลือกที่ไม่ได้เลือก:** Railway/Fly (เร็วกว่า ไม่แก้โค้ด แต่มีค่าใช้จ่ายรายเดือน) · Vercel Pro เพื่อ cron ตรงนาที (20 USD) → ใช้ cron-job.org แทน

**ระวัง:** ADR-0004 เคยปัด Interactions Endpoint ไว้ ต้องเขียน ADR-0005 กลับคำอย่างมีเหตุผล ไม่ลบของเก่า

## [2026-09-20] Phase 6 — Vercel Interactions Endpoint + Supabase (โค้ดเสร็จ ยังไม่ deploy)

**ทำอะไร:** grill 3 รอบสั้น ๆ → ตกลง: ตารางแยกตามชนิด (A) · config อื่นใน env `WATCH_CONFIG_JSON` · ใครก็กดปุ่มได้ · ตัด gateway เก็บ CLI (B) · ผู้ใช้ขอ "เก็บ transaction" → ตาราง `events` ทุกเหตุการณ์ เก็บตลอด · ถามว่าควรมีปุ่ม 📜 ไหม → มี เพราะ Supabase dashboard เปิดได้แค่เจ้าของโปรเจกต์ แต่ wishlist เป็นของทั้งช่อง
เขียน ADR-0005 (กลับคำ ADR-0004 ในบริบทใหม่) · `src/store.ts` adapter ไฟล์/Supabase · `src/db/` (Drizzle schema + store ที่ modal 1 ครั้ง = 1 transaction) · `src/notify/rest.ts` (Discord REST) · `src/notify/interactions.ts` (route → `{response, work}`) · `src/notify/verify.ts` (Ed25519 ด้วย node:crypto) · `api/interactions.ts` `api/cron/check.ts` `api/cron/ping.ts` · `vercel.json` (sin1 · cron 08:00 · includeFiles numerology.json · maxDuration 60) · `scripts/migrate.ts` `scripts/register-commands.ts` · ลบ `bot.ts` `discord.js` `watch` `daily-check.yml` · เทส 68 → 81 (store · verify · routing ด้วย fake DiscordRest) · smoke: PING ลงลายเซ็นจริง → 200 PONG, ลายเซ็นปลอม → 401, cron ผิด secret → 401 · `check --dry-run` กับ Drive จริงยังผ่าน

**ทำไมตัดสินใจแบบนี้:**
- `notified` แยกจาก `events` และ key เป็น pk → กันแจ้งซ้ำระดับฐานข้อมูลเมื่อ cron ชนคนกด 🔄 · `events` เป็นสำเนาเพื่ออ่าน
- ตัด gateway ทั้งที่ handoff แนะให้เก็บ เพราะเห็นโค้ดแล้วว่าคือ route ปุ่มชุดเดียวกัน 2 implementation — หนี้ที่จ่ายทุกครั้งที่เพิ่มปุ่ม · CLI `check` + webhook ยังเป็น fallback ที่ใช้ตรรกะเดียวกัน
- `Env.schedule` override แทน `fetcher` เพราะเทส routing ต้องไม่แตะเครือข่าย (เคยพลาดยิง Drive จริงแล้วได้ 404 ในเทส)
- `cronSecret` ว่าง = ปฏิเสธทุก request ไม่ใช่ล้มตอน createApp — ปุ่มต้องทำงานแม้ยังไม่ตั้ง cron
- panel ไม่มี "ออนไลน์มา X นาที" อีก (serverless) → แสดง "เช็คล่าสุด" จาก `meta.lastCheckAt`
- ตัด `statusEmbed`/`cmd_status` ที่ไม่มีปุ่มเรียกมาตั้งแต่รวมเป็น landing panel

**ทางเลือกที่ไม่ได้เลือก:** state JSON ก้อนเดียว (lost update) · ยุบ notified เข้า events (กันซ้ำด้วย jsonb query) · `discord-interactions`/`discord-api-types` package (Node มี Ed25519 แล้ว · type ที่ใช้มี 6 field) · Railway/Fly · Vercel Pro

**ยังไม่ได้ทำ/ทดสอบ:** ยังไม่ deploy จริง — ไม่รู้ว่า Vercel build `api/*.ts` (ESM + NodeNext import `.js`) ผ่านไหม · ยังไม่ได้ migrate ขึ้น Supabase จริง · ยังไม่เคยเห็น `waitUntil` ทำงานกับ deferred interaction จริง · drawio หน้า 06 ยังไม่มีวิธี D · `watch` เก่าบน Mac (pid 8525) ยังรันอยู่จนกว่า Vercel จะขึ้น

**ระวัง:** drizzle-kit 0.31.10 ดึง esbuild เก่ามา 2 เวอร์ชัน (npm audit 4 moderate, dev-only) · `.state/events.jsonl` ใหม่ในโหมดไฟล์ (อยู่ใน .gitignore แล้ว)

---

## งานถัดไป

ดู `HOTCACHE.md` › งานถัดไป
