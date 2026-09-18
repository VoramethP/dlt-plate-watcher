#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadConfig } from './config.js';
import { loadSchedule, runCheck, runOpeningPing, runPreview, type Env } from './core.js';
import { createBotNotifier, type BotNotifier } from './notify/bot.js';
import { COMMAND } from './notify/actions.js';
import { matchEmbed, panelEmbed, scheduleEmbed, statusEmbed } from './notify/discord.js';
import { todayBangkok as todayTH } from './thai-date.js';
import { webhookNotifier, type Notifier } from './notify/discord.js';
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

ปลายทาง Discord (ดู .env.example):
  DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID   โหมด bot — มีปุ่มใต้ข้อความ (ปุ่มตอบสนองตอน watch รันอยู่)
  DISCORD_WEBHOOK_URL                      โหมด webhook — ไม่มีปุ่ม`;

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

const env: Env = {
  statePath: values['dry-run'] ? `/tmp/dlt-plate-watcher-dry-${process.pid}.json` : values.state,
};

const startedAt = new Date();

/** ข้อความของคำสั่งแต่ละตัว (ใช้ทั้งใน CLI และปุ่มลัดบน Discord) */
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
function matchText(s: Awaited<ReturnType<typeof loadSchedule>>, config: Awaited<ReturnType<typeof loadConfig>>): string {
  const matches = matchSchedule(s.entries, config);
  if (!matches.length) return 'รอบนี้ไม่มีเลขใน wishlist เปิดจอง';
  return matches.map((m) => `${formatThaiDate(m.entry.openDate)} · ${m.entry.prefix} ${m.entry.from}–${m.entry.to}\n` +
    m.numbers.map((n) => `  ${m.entry.prefix} ${n}\t${m.reasons.get(n)!.join(', ')}`).join('\n')).join('\n\n');
}

/** เลือกปลายทาง: dry-run → ไม่ส่ง · มี bot token → bot (มีปุ่ม) · ไม่งั้น webhook */
async function connectNotifier(): Promise<Notifier | undefined> {
  if (values['dry-run']) return undefined;
  const { DISCORD_BOT_TOKEN: token, DISCORD_CHANNEL_ID: channelId, DISCORD_WEBHOOK_URL: webhook } = process.env;
  if (token && channelId) {
    return createBotNotifier({
      token, channelId, configPath: values.config, statePath: env.statePath,
      myEntries: async () => { const c = await getConfig(); return (await loadSchedule(c.scheduleFileId)).entries.filter((e) => e.vehicleType === c.vehicleType); },
      panel: async () => {
        const c = await getConfig();
        const s = await loadSchedule(c.scheduleFileId).catch(() => null);
        return panelEmbed({ wishlistCount: c.wishlist.numbers.length, version: s?.version ?? 'โหลดไม่ได้' });
      },
      commands: {
        [COMMAND.schedule]: async () => {
          const c = await getConfig();
          return { embeds: [scheduleEmbed(await loadSchedule(c.scheduleFileId), { title: '📅 ตารางเปิดจองสัปดาห์นี้', config: c, today: todayTH() })] };
        },
        [COMMAND.match]: async () => {
          const c = await getConfig();
          const matches = matchSchedule((await loadSchedule(c.scheduleFileId)).entries, c);
          return matches.length ? { embeds: matches.map(matchEmbed) } : '🎯 รอบนี้ไม่มีเลขใน wishlist เปิดจอง · กด 🔢 เพิ่มเลขได้จากข้อความแจ้งเตือน';
        },
        [COMMAND.check]: async () => { const r = await runCheck(await getConfig(), env); return `🔄 เช็คแล้ว · ควรแจ้ง ${r.planned.length} · ส่งใหม่ ${r.sent.length} รายการ`; },
        [COMMAND.status]: async () => {
          const c = await getConfig();
          const today = todayTH();
          const next = matchSchedule((await loadSchedule(c.scheduleFileId).catch(() => ({ entries: [] }))).entries, c)
            .map((m) => m.entry.openDate).filter((d) => d >= today).sort()[0];
          return { embeds: [statusEmbed({ startedAt, wishlistCount: c.wishlist.numbers.length, patternCount: c.wishlist.patterns.length, vehicleType: c.vehicleType, today, nextMatchDate: next })] };
        },
      },
    });
  }
  if (webhook) return webhookNotifier(webhook);
  return undefined;
}

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
      console.log(scheduleText(await loadSchedule(config.scheduleFileId)));
      return;
    }
    case 'match': {
      const config = await getConfig();
      console.log(matchText(await loadSchedule(config.scheduleFileId), config));
      return;
    }
    case 'preview': {
      env.notifier = await connectNotifier();
      const r = await runPreview(await getConfig(), env);
      console.log(`ส่ง preview ${r.sent} embed`);
      await env.notifier?.close?.();
      return;
    }
    case 'check': {
      env.notifier = await connectNotifier();
      const r = await runCheck(await getConfig(), env);
      console.log(`ส่งแจ้งเตือน ${r.sent.length} รายการ`);
      await env.notifier?.close?.();
      return;
    }
    case 'watch': {
      await getConfig(); // ตรวจ config ให้พังตั้งแต่ตอนเริ่ม ไม่ใช่ตอน 08:00
      env.notifier = await connectNotifier();
      // โหมด bot: โพสต์แผงควบคุมตอนเริ่ม · หลังจากนั้นแผงจะย้ายมาล่างสุดเองทุกครั้งที่แจ้งเตือน หรือพิมพ์ /panel
      if (env.notifier && 'sendPanel' in env.notifier) await (env.notifier as BotNotifier).sendPanel();
      let checkedDay = '';
      let pingedDay = '';
      console.log('เริ่มเฝ้า · check ทุกวัน 08:00 · ปิง 09:50 เฉพาะวันที่มีเลขใน wishlist เปิด (เวลาไทย) · Ctrl+C เพื่อหยุด');
      for (;;) {
        const day = todayBangkok();
        const minutes = minutesOfDayBangkok();
        try {
          // โหลด config ใหม่ทุกรอบ เพราะปุ่ม "กรอกเลข" แก้ไฟล์ได้ระหว่างรัน
          const config = await getConfig();
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
