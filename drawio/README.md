# drawio/

`dlt-plate-watcher.drawio` — ไฟล์เดียว 8 หน้า เปิดด้วย draw.io desktop หรือ https://app.diagrams.net

| หน้า | เรื่อง |
|---|---|
| 01 ภาพรวมระบบ | ใครคุยกับใคร และเส้นแดงคือสิ่งที่ตั้งใจไม่ทำ |
| 02 คำสั่ง check | flowchart ของ `runCheck` |
| 03 planNotifications | ตัดสินใจว่าวันนี้แจ้งอะไร + รูปแบบ key |
| 04 Parser PDF | PDF → ScheduleEntry |
| 05 watch loop และเวลา | loop รันค้าง + ไทม์ไลน์วันเปิดจอง |
| 06 การ deploy | 3 วิธีรัน |
| 07 Roadmap | phase ที่ผ่านมาและถัดไป |
| 08 Discord bot และปุ่ม | โหมด bot ปุ่ม 4 ปุ่มทำอะไร และขอบเขต |
| **99 raw** | **พื้นที่ของผู้ใช้** วาด/ร่างอะไรก็ได้ แล้วบอก Claude ให้มาดู |

## export PNG (macOS, draw.io desktop)

```bash
# ทีละหน้า (draw.io ≥ 27.0.2 นับหน้าจาก 1 · หน้า 99 raw = หน้าสุดท้าย (ตอนนี้ 9) · ใส่ 0 จะได้หน้าแรกเงียบ ๆ)
"/Applications/draw.io.app/Contents/MacOS/draw.io" -x -f png -p 9 -s 1.5 -b 20 -o drawio/png/99-raw.png drawio/dlt-plate-watcher.drawio
```

# ทุกหน้า
for i in 1 2 3 4 5 6 7 8 9; do "/Applications/draw.io.app/Contents/MacOS/draw.io" -x -f png -p $i -s 1.5 -b 20 -o "drawio/png/page-$i.png" drawio/dlt-plate-watcher.drawio; done
```

`png/` เป็นภาพ export ล่าสุด ไม่ใช่ต้นฉบับ — แก้ที่ .drawio แล้ว export ใหม่

ไฟล์นี้สร้างครั้งแรกด้วยสคริปต์ แต่ตั้งแต่นี้ **แก้ใน draw.io โดยตรง** (ไม่มี generator ใน repo จะได้ไม่ทับงานที่วาดมือ)
