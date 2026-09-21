#!/usr/bin/env node
// CLI สำหรับรันบนเครื่อง — ส่งได้ทาง webhook เท่านั้น · ปุ่มและ cron อยู่บน Vercel (api/ · ADR-0005)
import { parseArgs } from 'node:util';
import { resolveConfig } from './config.js';
import { loadSchedule, runCheck, runPreview, type Env } from './core.js';
import { webhookNotifier, type Notifier } from './notify/discord.js';
import { auctionIndex, loadAuctionRules, type AuctionIndex } from './auction.js';
import { composeDaily } from './daily.js';
import { loadNumerology } from './numerology.js';
import { embedToText } from './notify/actions.js';
import { matchSchedule } from './match.js';
import { normalizeDriveFileId } from './schedule/fetch.js';
import { VEHICLE_LABEL } from './schedule/types.js';
import { createStore } from './store.js';
import { formatThaiDate, todayBangkok } from './thai-date.js';

const HELP = `dlt-plate-watcher — เฝ้าตารางเปิดจองเลขทะเบียน แจ้งเตือนผ่าน Discord (ไม่จองแทน)

คำสั่ง:
  schedule            พิมพ์ตารางเปิดจองรอบปัจจุบัน
  match               พิมพ์เลขใน wishlist ที่จะเปิดจองรอบนี้ (ไม่ส่ง Discord)
  daily               พิมพ์การ์ดประจำวันของวันนี้ (ตัวที่ cron 09:30 โพสต์เข้าห้อง · ไม่ส่ง Discord)
  check               ดึงตาราง + ส่งแจ้งเตือนรายการใหม่เข้า Discord (ใช้กับ cron)
  preview             ส่ง match ของรอบนี้เข้า Discord ทันทีโดยไม่สน state (ไว้ดูหน้าตาข้อความ)

ตัวเลือก:
  --config <path>     ค่าเริ่มต้น watch.config.json (ถ้ามี env WATCH_CONFIG_JSON จะใช้แทนไฟล์)
  --state <path>      ค่าเริ่มต้น .state/notified.json (ถ้ามี env DATABASE_URL จะใช้ Supabase แทนไฟล์)
  --file-id <id|url>  ใช้ไฟล์ตารางอื่นแทนค่าใน config (รับ id หรือลิงก์ Drive)
  --dry-run           ไม่ส่ง Discord และไม่บันทึก state
  -h, --help

ปลายทาง Discord (ดู .env.example):
  DISCORD_WEBHOOK_URL                      โหมด webhook — ไม่มีปุ่ม
  ปุ่ม + cron 08:00/09:50 อยู่บน Vercel — ดู README › โหมด Vercel`;

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

/** ข้อความของคำสั่งแต่ละตัว */
function scheduleText(s: Awaited<ReturnType<typeof loadSchedule>>): string {
  const lines = [`ตารางเวอร์ชัน ${s.version} (Drive ${s.sourceFileId})`, ''];
  for (const type of ['car', 'van', 'pickup'] as const) {
    lines.push(`■ ${VEHICLE_LABEL[type]}`);
    for (const e of s.entries.filter((e) => e.vehicleType === type)) {
      lines.push(`  ${formatThaiDate(e.openDate).padEnd(28)} ${e.prefix}  ${String(e.from).padStart(4)} – ${String(e.to).padEnd(4)}  จดภายใน ${formatThaiDate(e.registerBy, false)}${e.note ? `  (${e.note})` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
function matchText(s: Awaited<ReturnType<typeof loadSchedule>>, config: Awaited<ReturnType<typeof resolveConfig>>, auction: AuctionIndex): string {
  const matches = matchSchedule(s.entries, config, auction);
  if (!matches.length) return 'รอบนี้ไม่มีเลขใน wishlist เปิดจอง';
  return matches.map((m) => {
    const head = `${formatThaiDate(m.entry.openDate)} · ${m.entry.prefix} ${m.entry.from}–${m.entry.to}`;
    const rows = m.numbers.map((n) => `  ${m.entry.prefix} ${n}\t${m.reasons.get(n)!.join(', ')}`);
    // เลขประมูลแยกท้ายบล็อก — เห็นว่ามีอยู่ แต่ไม่ปนกับเลขที่กดจองได้ (ADR-0006)
    const locked = m.auction.map((a) => `  🔨 ${m.entry.prefix} ${a.n}\t${a.group} — ต้องประมูล`);
    return [head, ...(rows.length ? rows : ['  (ไม่มีเลขที่จองออนไลน์ได้)']), ...locked].join('\n');
  }).join('\n\n');
}

/** เลือกปลายทาง: dry-run → ไม่ส่ง · ไม่งั้น webhook */
function connectNotifier(): Notifier | undefined {
  if (values['dry-run']) return undefined;
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  return webhook ? webhookNotifier(webhook) : undefined;
}

let closeStore: (() => Promise<void>) | undefined;

async function main() {
  // dry-run ใช้ state ชั่วคราวและไม่แตะ Supabase — จะได้จำลองได้โดยไม่เขียนอะไรจริง
  const store = await createStore({
    statePath: values['dry-run'] ? `/tmp/dlt-plate-watcher-dry-${process.pid}.json` : values.state,
    configPath: values.config,
    databaseUrl: values['dry-run'] ? undefined : process.env.DATABASE_URL,
  });
  closeStore = store.close?.bind(store);
  const env: Env = { store };
  const getConfig = async () => {
    const config = await resolveConfig({ configPath: values.config, store });
    if (values['file-id']) {
      const id = normalizeDriveFileId(values['file-id']);
      if (!id) throw new Error(`--file-id "${values['file-id']}" ไม่ใช่ id หรือลิงก์ Drive`);
      config.scheduleFileId = id;
    }
    return config;
  };

  switch (cmd) {
    case 'schedule': {
      const config = await getConfig();
      console.log(scheduleText(await loadSchedule(config.scheduleFileId)));
      return;
    }
    case 'match': {
      const config = await getConfig();
      console.log(matchText(await loadSchedule(config.scheduleFileId), config, auctionIndex(await loadAuctionRules(), config.wishlist.auction)));
      return;
    }
    case 'daily': {
      const config = await getConfig();
      const made = composeDaily({
        config, today: todayBangkok(), schedule: await loadSchedule(config.scheduleFileId),
        numerology: await loadNumerology(), auction: auctionIndex(await loadAuctionRules(), config.wishlist.auction),
      });
      console.log('skip' in made ? `ไม่โพสต์การ์ดวันนี้: ${made.skip}` : embedToText(made.embed));
      return;
    }
    case 'preview': {
      env.notifier = connectNotifier();
      const r = await runPreview(await getConfig(), env);
      console.log(`ส่ง preview ${r.sent} embed`);
      return;
    }
    case 'check': {
      env.notifier = connectNotifier();
      const r = await runCheck(await getConfig(), env);
      console.log(`ส่งแจ้งเตือน ${r.sent.length} รายการ`);
      return;
    }
    case 'watch':
      console.error('คำสั่ง watch ถูกย้ายไปรันบน Vercel แล้ว (ADR-0005) — ดู README › โหมด Vercel · บนเครื่องใช้ `check` กับ cron ของระบบแทน');
      process.exit(1);
      break;
    default:
      console.error(`ไม่รู้จักคำสั่ง "${cmd}"\n\n${HELP}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}).finally(() => closeStore?.());
