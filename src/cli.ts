#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadConfig } from './config.js';
import { loadSchedule, runCheck, runOpeningPing, runPreview } from './core.js';
import { matchSchedule } from './match.js';
import { normalizeDriveFileId } from './schedule/fetch.js';
import { VEHICLE_LABEL } from './schedule/types.js';
import { formatThaiDate, minutesOfDayBangkok, todayBangkok } from './thai-date.js';

const HELP = `dlt-plate-watcher — เฝ้าตารางเปิดจองเลขทะเบียน แจ้งเตือนผ่าน Discord (ไม่จองแทน)

คำสั่ง:
  schedule            พิมพ์ตารางเปิดจองรอบปัจจุบัน
  match               พิมพ์เลขใน wishlist ที่จะเปิดจองรอบนี้ (ไม่ส่ง Discord)
  check               ดึงตาราง + ส่งแจ้งเตือนรายการใหม่เข้า Discord (ใช้กับ cron)
  preview             ส่ง match ของรอบนี้เข้า Discord ทันทีโดยไม่สน state (ไว้ดูหน้าตาข้อความ)
  watch               รันค้างไว้: check ทุกวัน 08:00 และปิงก่อนเปิดจอง 09:50 (เวลาไทย)

ตัวเลือก:
  --config <path>     ค่าเริ่มต้น watch.config.json
  --state <path>      ค่าเริ่มต้น .state/notified.json
  --file-id <id|url>  ใช้ไฟล์ตารางอื่นแทนค่าใน config (รับ id หรือลิงก์ Drive)
  --dry-run           ไม่ส่ง Discord และไม่บันทึก state
  -h, --help

ต้องตั้ง env DISCORD_WEBHOOK_URL (ดู .env.example)`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string', default: 'watch.config.json' },
    state: { type: 'string', default: '.state/notified.json' },
    'file-id': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const cmd = positionals[0];
if (values.help || !cmd) { console.log(HELP); process.exit(0); }

const env = {
  webhookUrl: values['dry-run'] ? undefined : process.env.DISCORD_WEBHOOK_URL,
  statePath: values['dry-run'] ? `/tmp/dlt-plate-watcher-dry-${process.pid}.json` : values.state,
};

async function getConfig() {
  const config = await loadConfig(values.config);
  if (values['file-id']) {
    const id = normalizeDriveFileId(values['file-id']);
    if (!id) throw new Error(`--file-id "${values['file-id']}" ไม่ใช่ id หรือลิงก์ Drive`);
    config.scheduleFileId = id;
  }
  return config;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  switch (cmd) {
    case 'schedule': {
      const config = await getConfig();
      const s = await loadSchedule(config.scheduleFileId);
      console.log(`ตารางเวอร์ชัน ${s.version} (Drive ${s.sourceFileId})\n`);
      for (const type of ['car', 'van', 'pickup'] as const) {
        console.log(`■ ${VEHICLE_LABEL[type]}`);
        for (const e of s.entries.filter((e) => e.vehicleType === type)) {
          console.log(`  ${formatThaiDate(e.openDate).padEnd(28)} ${e.prefix}  ${String(e.from).padStart(4)} – ${String(e.to).padEnd(4)}  จดภายใน ${formatThaiDate(e.registerBy, false)}${e.note ? `  (${e.note})` : ''}`);
        }
        console.log();
      }
      return;
    }
    case 'match': {
      const config = await getConfig();
      const s = await loadSchedule(config.scheduleFileId);
      const matches = matchSchedule(s.entries, config);
      if (!matches.length) { console.log('รอบนี้ไม่มีเลขใน wishlist เปิดจอง'); return; }
      for (const m of matches) {
        console.log(`\n${formatThaiDate(m.entry.openDate)} · ${m.entry.prefix} ${m.entry.from}–${m.entry.to}`);
        for (const n of m.numbers) console.log(`  ${m.entry.prefix} ${n}\t${m.reasons.get(n)!.join(', ')}`);
      }
      return;
    }
    case 'preview': {
      const r = await runPreview(await getConfig(), env);
      console.log(`ส่ง preview ${r.sent} embed`);
      return;
    }
    case 'check': {
      const r = await runCheck(await getConfig(), env);
      console.log(`ส่งแจ้งเตือน ${r.sent.length} รายการ`);
      return;
    }
    case 'watch': {
      const config = await getConfig();
      let checkedDay = '';
      let pingedDay = '';
      console.log('เริ่มเฝ้า · check ทุกวัน 08:00 · ปิง 09:50 เฉพาะวันที่มีเลขใน wishlist เปิด (เวลาไทย) · Ctrl+C เพื่อหยุด');
      for (;;) {
        const day = todayBangkok();
        const minutes = minutesOfDayBangkok();
        try {
          if (minutes >= 8 * 60 && checkedDay !== day) {
            await runCheck(config, env);
            checkedDay = day;
          }
          if (minutes >= 9 * 60 + 50 && pingedDay !== day) {
            const r = await runOpeningPing(config, env);
            if (r.sent.length) console.log(`${new Date().toISOString()} ปิงก่อนเปิดจอง ${r.sent.length} รายการ`);
            pingedDay = day;
          }
        } catch (err) {
          console.error('รอบนี้พลาด:', err instanceof Error ? err.message : err);
        }
        await sleep(60_000);
      }
    }
    default:
      console.error(`ไม่รู้จักคำสั่ง "${cmd}"\n\n${HELP}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
