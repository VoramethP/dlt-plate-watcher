# ADR-0002 · ใช้ Node CLI + TypeScript แทนสแต็กกลาง (Nuxt + Supabase)

- สถานะ: ยอมรับ · 2026-09-18
- เกี่ยวข้อง: FDR-0001 golden path stack

## บริบท

สแต็กกลางของโปรเจกต์ใหม่คือ Nuxt 4 + Supabase Postgres + Drizzle + Zod + Vitest แต่โปรเจกต์นี้ไม่มีหน้าจอ ไม่มีผู้ใช้หลายคน
ไม่มีข้อมูลที่ต้องเก็บถาวรนอกจาก "เคยแจ้งอะไรไปแล้ว" งานทั้งหมดคือ ดึง PDF → แปลง → เทียบ → ยิง webhook วันละครั้ง

## การตัดสินใจ

- Node ≥ 22 + TypeScript (ESM) รันด้วย `tsx` · ไม่มี framework
- เก็บสถานะเป็นไฟล์ JSON ใน `.state/` · ไม่มีฐานข้อมูล
- คงส่วนที่ยังใช้ได้จากสแต็กกลาง: **Zod** ตรวจ config, **Vitest** เทส
- แจ้งเตือนผ่าน Discord **webhook** ไม่ใช่ bot token เพราะไม่ต้องรับข้อความขาเข้า
- รันได้สามแบบ: มือ (`npm run check`), ค้างไว้ (`watch`), หรือ GitHub Actions cron

## ทางเลือกที่ไม่ได้เลือก

- **Nuxt + Supabase** — ได้ UI ตั้งค่า wishlist แต่ต้อง deploy และดูแลฐานข้อมูลเพื่องานที่ไฟล์ JSON ไฟล์เดียวก็พอ
- **Python** — เหมาะเหมือนกัน แต่ทีมใช้ TypeScript เป็นหลัก และ pdf.js (ผ่าน `unpdf`) แปลงตารางไทยได้ครบโดยไม่ต้องลง poppler
- **Discord bot (gateway)** — เกินความจำเป็น จนกว่าจะอยากพิมพ์สั่งจาก Discord

## ผลที่ตามมา

- ไม่มี UI: แก้ wishlist ด้วยการแก้ `watch.config.json`
- ถ้าวันหนึ่งต้องรองรับผู้ใช้หลายคน ค่อยย้ายส่วน state ไป Supabase โดยไม่ต้องแตะ parser/matcher
