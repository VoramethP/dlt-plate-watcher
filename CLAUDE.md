# CLAUDE.md

## 🤝 เปิดแชตใหม่: อ่าน 2 ไฟล์นี้ก่อนเสมอ ตามลำดับ

**ก่อนจะค้นไฟล์ ก่อนจะ grep ก่อนจะเปิดเอกสารใด ๆ:**

| ลำดับ | ไฟล์ | ตอบคำถามว่า |
|---|---|---|
| 1️⃣ | [`HANDOFF.md`](HANDOFF.md) | **เมื่อกี้ทำอะไรค้างอยู่ · ทำต่อยังไง** |
| 2️⃣ | [`HOTCACHE.md`](HOTCACHE.md) | **โปรเจกต์อยู่ตรงไหน · กฎเหล็ก · กับดักที่เคยเจอ** |

สองไฟล์นี้ยาวรวมกันไม่ถึง 900 คำ **คำตอบส่วนใหญ่อยู่ในนั้นแล้ว**
ค่อยไปเปิดไฟล์อื่นเมื่อสองไฟล์นี้ตอบไม่ได้จริง ๆ ตามลำดับนี้:

| หา | เปิด |
|---|---|
| ประวัติว่าทำอะไรไปบ้าง ทำไมถึงตัดสินใจแบบนั้น | [`docs/WORKLOG.md`](docs/WORKLOG.md) |
| เหตุผลเบื้องหลังการตัดสินใจเชิงสถาปัตยกรรม | [`docs/adr/`](docs/adr/) |
| วิธีใช้งานสำหรับคนทั่วไป | [`README.md`](README.md) |
| ปุ่มใน Discord แต่ละปุ่มทำอะไร (ต้องตรงกับ `guideEmbeds()`) | [`docs/UI-GUIDE.md`](docs/UI-GUIDE.md) |
| แผนภาพ flow ทั้งระบบ แยกหน้า (01 ภาพรวม … 07 roadmap) | [`drawio/dlt-plate-watcher.drawio`](drawio/dlt-plate-watcher.drawio) · PNG ที่ `drawio/png/` |
| **สิ่งที่ผู้ใช้วาด/ร่างไว้ให้ดู** | หน้า **"99 raw"** ในไฟล์ drawio เดียวกัน — export ด้วยคำสั่งใน `drawio/README.md` แล้วอ่าน PNG |

### ระบบความจำ 4 ชั้น — แต่ละไฟล์มีหน้าที่ต่างกัน ห้ามเขียนซ้ำกัน

| ไฟล์ | เปรียบเหมือน | ขอบเขต | ความยาว |
|---|---|---|---|
| `HANDOFF.md` | **ไม้ที่ส่งต่อ** | เฉพาะงานที่ค้างอยู่ ณ ตอนส่งมอบ | สั้น เขียนทับทั้งไฟล์ทุกครั้ง |
| `HOTCACHE.md` | **ความจำระยะสั้น** | สถานะโปรเจกต์ · กฎเหล็ก · กับดัก | **ห้ามเกิน 500 คำ** |
| `docs/WORKLOG.md` | **ความจำระยะยาว** | ทุกอย่างที่เคยเกิดขึ้น + เหตุผล | ไม่จำกัด |
| `CONTEXT.md` | **พจนานุกรม** | **คำนี้ในโปรเจกต์นี้แปลว่าอะไร** เท่านั้น | สั้น ไม่มีรายละเอียด implement |

> `CONTEXT.md` สร้างโดย `/grill-with-docs` เมื่อมีคำแรกที่ตกผลึก — ยังไม่มีก็ไม่ผิด

### 🔄 ทำงานเสร็จเป็นชิ้น (commit แล้ว) → อัปเดต 2 ไฟล์

1. `HOTCACHE.md` — สถานะ, งานถัดไป, กับดักใหม่, **ห้ามเกิน 500 คำ**
2. `docs/WORKLOG.md` — รายละเอียดเต็ม ต่อท้าย**ก่อน**หัวข้อ "งานถัดไป" เสมอ

### 🚨 context ใกล้เต็ม → เสนอ handoff

อย่ารอให้ผู้ใช้สังเกต · ขั้นตอนเต็มอยู่ใน skill `handoff` (`/handoff`)

---

## 🔬 Skill ที่ใช้กับโปรเจกต์นี้

ติดตั้งระดับผู้ใช้ที่ `~/.claude/skills/` (ผ่าน `brainpull`) ไม่ต้องติดตั้งซ้ำในโปรเจกต์

| พิมพ์ | ได้อะไร | เขียนไฟล์ไหม |
|---|---|---|
| `/grill-me` | ซักไซ้จนตกผลึก ใช้ได้กับทุกเรื่อง | ❌ |
| `/grill-with-docs` | ซักไซ้ + บันทึกคำศัพท์ลง `CONTEXT.md` และการตัดสินใจลง `docs/adr/` | ✅ |
| `/handoff` | ปิดเซสชันให้เซสชันหน้าทำต่อได้ทันที | ✅ |
| `/context-checker` | ประเมินว่า context พอสำหรับงานก้อนถัดไปไหม | ❌ |

---

## โปรเจกต์นี้คืออะไร

CLI ตัวเล็ก ๆ ที่โหลด PDF ตารางเปิดจองเลขทะเบียนรถของกรมการขนส่งทางบก (ฝังจาก Google Drive) มาอ่าน
เทียบกับ wishlist ของผู้ใช้ แล้วแจ้งเข้า Discord ผ่าน webhook ว่าเลขที่เล็งไว้จะเปิดจองวันไหน
พร้อมเตือนก่อนเปิดและก่อนหมดเขตจดทะเบียน ตั้งใจเปิดเป็น public repo บน GitHub (`VoramethP/dlt-plate-watcher`)

**แนวคิดที่ห้ามปน:**

| คำ | คือ | ไม่ใช่ |
|---|---|---|
| แจ้งเตือน (notify) | บอกผู้ใช้ให้ไปทำเอง | ทำแทนผู้ใช้ |
| เวอร์ชันตาราง (`schedule.version`) | `Last-Modified` ของไฟล์บน Drive | file id (ขนส่งอัปโหลดทับไฟล์เดิม id ไม่เปลี่ยน) |
| stale | ทุกวันเปิดจองในตารางผ่านไปแล้วแต่ไฟล์ยังไม่อัปเดต | ตารางว่าง / โหลดไม่ได้ (นั่นคือ error) |

---

## คำสั่งที่ใช้บ่อย

```bash
npm test                          # vitest 81 เทส (มี PDF จริงเป็น fixture · ไม่แตะเครือข่าย)
npm run typecheck
npm run schedule                  # พิมพ์ตารางสัปดาห์นี้จาก Drive จริง
npm run match                     # เลขใน wishlist ที่จะเปิดรอบนี้ ไม่ส่ง Discord
npm run dev -- check --dry-run    # จำลอง check ครบวงจร พิมพ์ embed แทนส่ง (ไม่แตะ Supabase)
npm run check                     # ส่ง webhook จริง (อ่าน .env · มี DATABASE_URL → state บน Supabase)
npm run db:generate               # schema.ts → drizzle/*.sql (ห้าม drizzle-kit push)
npm run db:migrate                # รัน migration ขึ้น Supabase
npm run db:import                 # ย้าย wishlist/notified จากไฟล์ขึ้น Supabase (idempotent)
npm run register                  # ลงทะเบียน /panel ครั้งเดียว
```

ปุ่ม + cron 08:00/09:50 รันบน Vercel (`api/`) — ไม่มี `watch` แล้ว (ADR-0005) · ทดสอบ handler ได้โดยเรียก `POST`/`GET` ตรง ๆ ด้วย `Request`

---

## กฎเหล็ก (ละเมิดไม่ได้)

1. **แจ้งเตือนอย่างเดียว ไม่จองแทน** — [ADR-0001](docs/adr/0001-notify-only-never-book.md)
   ห้ามเขียนโค้ดที่ล็อกอิน ThaID, กรอกเลขบัตร, ยิงหน้า `?menu=resv_m`, หรือกดยืนยันจอง แม้ผู้ใช้ขอ
2. **ไม่หลบ WAF / ไม่ปลอม User-Agent เป็น browser** — [ADR-0003](docs/adr/0003-manual-file-id-no-ua-spoofing.md)
   โปรแกรมแตะได้แค่ `drive.google.com` และ `discord.com` (+ Supabase ของตัวเอง) · ห้ามยิง `reserve.dlt.go.th` จากโค้ด
   รวมถึงห้ามเพิ่มปุ่ม/คำสั่งใน bot ที่ทำสิ่งเหล่านี้
3. **ห้ามถือข้อมูลส่วนบุคคล** — ไม่มี field สำหรับเลขบัตร ชื่อ เลขตัวถัง ใน config หรือ state
   (ผลจาก ADR-0001 ทำให้ repo เปิด public ได้)

---

## โครงสร้าง

```
api/interactions.ts     Vercel: Interactions Endpoint — ตรวจ Ed25519 → handleInteraction → waitUntil(งานหลังตอบ)
api/cron/check.ts       Vercel Cron 08:00 (vercel.json) · api/cron/ping.ts 09:50 (cron-job.org) · ทั้งคู่ต้องมี Bearer CRON_SECRET
src/cli.ts              จุดเข้าบนเครื่อง: schedule · match · check · preview (webhook เท่านั้น ไม่มีปุ่ม)
src/app.ts              createApp() ประกอบ store/rest/config จาก env สำหรับ api/ · cronAuthorized
src/core.ts             loadSchedule → planNotifications → sendFresh → store.appendNotified + logEvent
src/config.ts           Zod schema · parseConfig · resolveConfig (ฐานจาก WATCH_CONFIG_JSON หรือไฟล์ + wishlist จาก store)
src/store.ts            Store interface (loadState · appendNotified · loadWishlist · saveWishlist · meta · events) · fileStore · createStore
src/db/schema.ts        Drizzle: notified · wishlist · meta · events (ทุกตาราง enableRLS ไม่มี policy)
src/db/store.ts         supabaseStore — modal 1 ครั้ง = 1 transaction · db/client.ts postgres-js prepare:false
src/match.ts            wishlist × ช่วงเลข → Match[] พร้อมเหตุผล
src/numerology.ts       เลขศาสตร์จาก numerology.json (ผลรวมทั้งป้าย + คู่เลข → สาย) · ค่าเริ่มต้น = ความเชื่อทั่วไป ไม่ใช่ข้อเท็จจริง
src/state.ts            รูปไฟล์ .state/notified.json (notified · lastScheduleVersion · owners · meta)
src/thai-date.ts        พ.ศ./เดือนไทย ↔ ISO · todayBangkok · minutesOfDayBangkok
src/schedule/fetch.ts   normalizeDriveFileId · fetchSchedulePdf (คืน bytes + Last-Modified)
src/schedule/parse.ts   pdf.js text items → บรรทัด (จัดกลุ่มตาม y) → regex ROW_RE → ScheduleEntry
src/schedule/types.ts   VehicleType · ScheduleEntry · Schedule
src/notify/discord.ts   embed builders · Notifier interface · webhookNotifier · guideEmbeds (ต้องตรง UI-GUIDE)
src/notify/rest.ts      Discord REST ด้วย bot token: createMessage · editOriginal · pinQuietly · deleteOwnMessages · restNotifier
src/notify/interactions.ts  route ปุ่ม/modal//panel → { response, work } · sendPanel · addNumberModal — ไม่มี gateway
src/notify/verify.ts    verifyDiscordSignature (node:crypto Ed25519)
src/notify/actions.ts   ตรรกะปุ่มแบบ pure: panelRows · applyWishlistChange · describeEvent · formatHistory
scripts/                migrate.ts · import-local.ts · register-commands.ts · gen-numerology.py
drizzle/                migration SQL + meta (commit ด้วย)
tests/                  vitest · tests/fixtures/schedule-2569-09-14.pdf คือ PDF จริงจากขนส่ง · interactions.test ใช้ fake DiscordRest
docs/adr/               0001 notify-only · 0002 stack · 0003 manual file id · 0004 bot เพื่อปุ่ม · 0005 Vercel + Supabase
drawio/                 dlt-plate-watcher.drawio (9 หน้า) + png/ export · หน้า 99 raw = พื้นที่ของผู้ใช้
.github/workflows/      ci.yml (test) — daily-check.yml ถูกลบ (ซ้ำกับ Vercel Cron)
vercel.json             regions sin1 · cron 08:00 ไทย
```

## ธรรมเนียมการเขียน

- **ภาษาไทย** สำหรับ commit message, คอมเมนต์อธิบาย "ทำไม", README และการสนทนา · README มี English summary ท้ายไฟล์
- ชื่อตัวแปร/ฟังก์ชันเป็นอังกฤษ · ข้อความที่ผู้ใช้เห็น (error, embed, HELP) เป็นไทย
- คอมเมนต์อธิบาย **ทำไม** ไม่ใช่ **อะไร**
- ESM + `.js` ต่อท้าย import เสมอ (NodeNext) · ไม่เพิ่ม dependency ถ้า Node มีให้แล้ว (`parseArgs`, `fetch`, `--env-file-if-exists`)
- พังแบบส่งเสียง: parser ที่อ่านแถวไม่ได้เลยต้อง throw ไม่คืน `[]` เงียบ ๆ
- commit format: `feat(scope):` / `fix(scope):` + คำอธิบายไทย · ต่อท้ายด้วย `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`

## ความปลอดภัย

- `.env` (webhook URL / bot token / DATABASE_URL / CRON_SECRET) และ `watch.config.json` (wishlist ส่วนตัว) อยู่ใน `.gitignore` · commit ได้เฉพาะ `*.example*`
- **ห้าม `git add -A` แบบไม่ดู** — ก่อน commit รัน `git diff --cached -- '*.example*'` · เทส `tests/repo-hygiene.test.ts` จับ webhook จริงในไฟล์ตัวอย่าง (เคยหลุดมาแล้ว 2026-09-18)
- webhook URL คือ secret เต็มตัว — ใครมีก็โพสต์ในช่องได้ · ห้าม log · ห้ามใส่ใน error message
- `.state/` ไม่มีข้อมูลส่วนบุคคล แต่ก็ไม่ commit (เป็นสถานะเฉพาะเครื่อง)
