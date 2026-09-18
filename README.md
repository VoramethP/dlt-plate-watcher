# dlt-plate-watcher

เฝ้าตารางเปิดจองเลขทะเบียนรถของกรมการขนส่งทางบก แล้วแจ้งเตือนเข้า Discord เมื่อเลขที่คุณเล็งไว้กำลังจะเปิดจอง

> **แจ้งเตือนอย่างเดียว ไม่จองแทน** — การจองต้องยืนยันตัวตนผ่านแอป ThaID ด้วยตัวคุณเองทุกครั้ง
> โปรแกรมนี้ไม่ล็อกอิน ไม่กรอกฟอร์ม ไม่ยิงหน้าจอง และไม่หลบระบบกันบอตของขนส่ง ([ทำไม](docs/adr/0001-notify-only-never-book.md))

```
🎯 เลขที่เล็งไว้จะเปิดจอง ศุกร์ 18 กันยายน 2569
รถยนต์นั่งส่วนบุคคลไม่เกิน 7 คน · ช่วงที่เปิด: 8ขฉ 5001 – 6500
เลขที่ตรงเงื่อนไข (3): 8ขฉ 5050 · 8ขฉ 5151 · 8ขฉ 5555
เปิดจอง 10:00 – 16:00 น. · ต้องจดทะเบียนภายใน 18 ตุลาคม 2569
```

## มันทำอะไรให้บ้าง

| เมื่อไหร่ | แจ้งอะไร |
|---|---|
| ขนส่งออกตารางสัปดาห์ใหม่ | สรุปตารางทั้ง 3 ประเภทรถ |
| ตารางมีเลขที่ตรง wishlist | วันเปิด หมวดอักษร ช่วงเลข และเลขที่ตรงพร้อมเหตุผล |
| 1 วันก่อนวันเปิดจองของรถประเภทคุณ | เตือนเตรียม ThaID · เลขตัวถัง · ชื่อตรงบัตร |
| 09:50 น. ของวันที่มีเลขในฝันเปิด (โหมด `watch`) | ปิงว่าอีก 10 นาทีเปิด พร้อมลิงก์หน้าจอง |
| 7 วัน และ 1 วันก่อนหมดเขตจดทะเบียน | เตือนว่าเลขจะหลุดถ้าไม่ไปจด |
| ตารางที่อ่านได้หมดอายุแล้ว | เตือนให้ไปเช็ค file id ใหม่ (ดูด้านล่าง) |

ทุกอย่างถูกจำไว้ใน `.state/` จึงแจ้งแต่ละเรื่องครั้งเดียว รัน cron ถี่แค่ไหนก็ไม่สแปม

## เริ่มใช้ใน 5 นาที

ต้องมี Node 22 ขึ้นไป

```bash
git clone https://github.com/VoramethP/dlt-plate-watcher && cd dlt-plate-watcher
npm install
cp watch.config.example.json watch.config.json
cp .env.example .env            # ใส่ Discord webhook URL ของคุณ
```

แก้ `watch.config.json`:

```jsonc
{
  // ลิงก์ PDF ตารางบน Google Drive — วิธีหาอยู่หัวข้อถัดไป (ค่าเริ่มต้นใช้ได้เลย)
  "scheduleFileId": "https://drive.google.com/file/d/1UP-epw_Yxn3j8OrWsj10oKKxind5rktI/preview",
  "vehicleType": "car",         // car = เก๋ง/กระบะ 4 ประตู · van = รถตู้ · pickup = กระบะบรรทุก/2 ประตู
  "wishlist": {
    "numbers": [9, 99, 999, 9999, 1234],            // เลขที่อยากได้ตรง ๆ
    "patterns": ["^(\\d)\\1{2,3}$", "^(\\d)(\\d)\\1\\2$"],  // regex: เลขตอง 3–4 ตัว, เลขคู่สลับ (1212)
    "digitSums": []                                  // ผลรวมเลข เช่น [9, 24] — ระวังตรงเยอะมาก
  },
  "reminders": { "daysBeforeOpen": [1], "daysBeforeRegisterDeadline": [7, 1] }
}
```

แล้วลอง:

```bash
npm run schedule        # ดูตารางสัปดาห์นี้
npm run match           # ดูว่าเลขในฝันจะเปิดวันไหน (ยังไม่ส่ง Discord)
npm run check           # ส่งแจ้งเตือนรายการใหม่เข้า Discord
```

## วิธีรันให้เตือนเอง

**แบบง่ายสุด: รันค้างไว้บนเครื่องที่เปิดตลอด**

```bash
npm run watch           # check ทุกวัน 08:00 + ปิง 09:50 ในวันที่มีเลขในฝันเปิด (เวลาไทย)
```

**แบบ GitHub Actions (ฟรี ไม่ต้องมีเครื่อง)** — fork repo นี้ แล้วตั้ง secrets 2 ตัวใน Settings → Secrets → Actions:

| Secret | ค่า |
|---|---|
| `DISCORD_WEBHOOK_URL` | webhook URL ของช่องที่จะให้แจ้ง |
| `WATCH_CONFIG_JSON` | เนื้อหา `watch.config.json` ทั้งไฟล์ |

[`daily-check.yml`](.github/workflows/daily-check.yml) จะรัน `check` ทุกเช้าวันทำการ 08:00 น. (cron ของ GitHub อาจคลาดได้หลายนาที
จึงไม่ใช้ปิง 09:50 ในโหมดนี้) กด Run workflow เพื่อทดสอบได้ทันที

**แบบ cron ของตัวเอง**

```cron
0 8 * * 1-5  cd /path/to/dlt-plate-watcher && npm run -s check >> check.log 2>&1
```

## ตารางมาจากไหน แล้วทำไมต้องมี `scheduleFileId`

หน้า [ตารางเปิดจองหมายเลข](https://reserve.dlt.go.th/reserve/v2/?menu=schedule) ของขนส่งฝัง PDF จาก Google Drive ไว้ใน `<iframe>`
โปรแกรมโหลด PDF นั้นตรงจาก Drive แล้วอ่านตารางออกมาเอง (ไม่ต้องลง poppler หรืออะไรเพิ่ม)

เราไม่ดึงหน้าเว็บขนส่งเพื่อหาลิงก์ให้อัตโนมัติ เพราะ WAF ของขนส่งปฏิเสธทุก client ที่ไม่ใช่เบราว์เซอร์
และเราเลือกจะไม่ปลอมตัวเป็นเบราว์เซอร์ ([ADR-0003](docs/adr/0003-manual-file-id-no-ua-spoofing.md))
จากที่สังเกต ขนส่ง**อัปโหลดทับไฟล์เดิม**ทุกสัปดาห์ ค่าเริ่มต้นจึงน่าจะใช้ได้ยาว
ถ้าวันหนึ่งได้รับแจ้ง "ตารางที่ตั้งไว้หมดอายุแล้ว":

1. เปิดหน้าตารางในเบราว์เซอร์ → คลิกขวา → View Page Source
2. หา `drive.google.com/file/d/…/preview` ตัวที่**ไม่ได้**อยู่ในคอมเมนต์ `<!-- -->`
3. วางลิงก์ (หรือ HTML ทั้งก้อนก็ได้ โปรแกรมแกะ id ให้) ลง `scheduleFileId`

## คำสั่งทั้งหมด

```
schedule            พิมพ์ตารางเปิดจองรอบปัจจุบัน
match               พิมพ์เลขใน wishlist ที่จะเปิดจองรอบนี้
check               ดึงตาราง + ส่งแจ้งเตือนรายการใหม่เข้า Discord
watch               รันค้างไว้: check 08:00 และปิง 09:50 ทุกวัน (เวลาไทย)

--config <path>     ค่าเริ่มต้น watch.config.json
--state <path>      ค่าเริ่มต้น .state/notified.json
--file-id <id|url>  ใช้ไฟล์ตารางอื่นชั่วคราว
--dry-run           ไม่ส่ง Discord ไม่บันทึก state (พิมพ์ embed ออกจอแทน)
```

## โครงสร้าง

```
src/
  cli.ts              จุดเข้า · แปลง argument · คำสั่ง 4 ตัว
  core.ts             ขั้นตอนหลัก: โหลดตาราง → วางแผนแจ้ง → ส่งเฉพาะที่ใหม่ → บันทึก state
  config.ts           schema ของ watch.config.json (Zod)
  match.ts            จับ wishlist กับช่วงเลขที่เปิด
  state.ts            จำว่าแจ้งอะไรไปแล้ว (.state/notified.json)
  thai-date.ts        พ.ศ./ชื่อเดือนไทย ↔ ISO · เวลาไทย
  schedule/fetch.ts   โหลด PDF จาก Drive (+ Last-Modified เป็นเวอร์ชันตาราง)
  schedule/parse.ts   PDF → แถวตาราง (จัดกลุ่ม text ตามพิกัด y แล้ว regex)
  notify/discord.ts   ประกอบ embed และยิง webhook
tests/                Vitest · มี PDF จริงของขนส่งเป็น fixture
docs/adr/             เหตุผลของการตัดสินใจสำคัญ
```

```bash
npm test              # 26 tests
npm run typecheck
```

## ข้อจำกัดที่ควรรู้

- ตารางที่รองรับคือของ **สำนักงานขนส่งกรุงเทพฯ พื้นที่ 5** (ระบบกลางของขนส่ง) · เลขประมูล/เลขสวยที่ต้องประมูลไม่อยู่ในนี้
- ถ้าขนส่งเปลี่ยนรูปแบบ PDF โปรแกรมจะพังแบบส่งเสียง (โยน error ว่าอ่านแถวไม่ได้) ไม่พังเงียบ
- ปิง 09:50 อิงเวลาประกาศ 10:00 น. บนหน้าเว็บ ไม่ได้เช็คสถานะจริงจากระบบ
- ประกาศของขนส่ง: ชื่อผู้จองต้องเป็นเจ้าของรถ และห้ามนำเลขที่จองไปจำหน่ายจ่ายโอน มิฉะนั้นถูกยกเลิกโดยไม่แจ้ง

## English summary

Watches the weekly plate-number reservation schedule published by Thailand's Department of Land Transport (a PDF embedded from Google Drive),
matches it against your wishlist (exact numbers, regex patterns, digit sums) and posts Discord webhook alerts:
new schedule, matching numbers, day-before and 10-minutes-before reminders, and registration deadlines.
**Notify-only by design**: it never logs in, never touches the reservation form, and never works around the site's bot protection.
Node ≥ 22, TypeScript, zero framework. See `docs/adr/` for the reasoning.

## License

MIT
