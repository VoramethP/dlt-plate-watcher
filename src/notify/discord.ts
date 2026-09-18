// ส่งข้อความเข้า Discord ผ่าน webhook — ไม่ต้องสร้าง bot ไม่ต้องขอ intent
import type { Match } from '../match.js';
import { DLT_RESERVE_PAGE, DLT_SCHEDULE_PAGE, type Fetcher } from '../schedule/fetch.js';
import type { Schedule, ScheduleEntry } from '../schedule/types.js';
import { VEHICLE_LABEL } from '../schedule/types.js';
import { formatThaiDate } from '../thai-date.js';

export interface Embed {
  title: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

const COLOR = { info: 0x3b82f6, match: 0x22c55e, warn: 0xf59e0b, closed: 0x6b7280 } as const;
const FOOTER = 'dlt-plate-watcher · แจ้งเตือนอย่างเดียว การจองต้องทำเองผ่าน ThaID';

export async function sendDiscord(webhookUrl: string, payload: { content?: string; embeds?: Embed[] }, fetcher: Fetcher = fetch) {
  const res = await fetcher(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'DLT Plate Watcher', ...payload }),
  });
  if (!res.ok) throw new Error(`Discord webhook → HTTP ${res.status}: ${await res.text()}`);
}

function rangeLine(e: ScheduleEntry): string {
  return `**${e.prefix}** ${e.from} – ${e.to}`;
}

export function matchEmbed(m: Match): Embed {
  const e = m.entry;
  const shown = m.numbers.slice(0, 25); // Discord field มีลิมิต 1024 ตัวอักษร
  const list = shown.map((n) => `\`${e.prefix} ${n}\` · ${m.reasons.get(n)!.join(', ')}`).join('\n');
  const more = m.numbers.length > shown.length ? `\n…และอีก ${m.numbers.length - shown.length} เลข` : '';
  return {
    title: `🎯 เลขที่เล็งไว้จะเปิดจอง ${formatThaiDate(e.openDate)}`,
    description: `${VEHICLE_LABEL[e.vehicleType]}\nช่วงที่เปิด: ${rangeLine(e)}`,
    color: COLOR.match,
    fields: [
      { name: `เลขที่ตรงเงื่อนไข (${m.numbers.length})`, value: list + more },
      { name: 'เปิดจอง', value: '10:00 – 16:00 น. ที่ reserve.dlt.go.th', inline: true },
      { name: 'ต้องจดทะเบียนภายใน', value: formatThaiDate(e.registerBy, false), inline: true },
      ...(e.note ? [{ name: 'หมายเหตุจากขนส่ง', value: e.note }] : []),
    ],
    footer: { text: FOOTER },
  };
}

export function scheduleEmbed(schedule: Schedule): Embed {
  const byType = new Map<string, ScheduleEntry[]>();
  for (const e of schedule.entries) byType.set(e.vehicleType, [...(byType.get(e.vehicleType) ?? []), e]);
  return {
    title: '📅 ขนส่งออกตารางเปิดจองรอบใหม่',
    description: `อัปเดตเมื่อ ${schedule.version}`,
    color: COLOR.info,
    fields: [...byType.entries()].map(([type, list]) => ({
      name: VEHICLE_LABEL[type as keyof typeof VEHICLE_LABEL],
      value: list.map((e) => `${formatThaiDate(e.openDate)} → ${rangeLine(e)}`).join('\n'),
    })),
    footer: { text: FOOTER },
  };
}

export function reminderEmbed(kind: 'open' | 'deadline', e: ScheduleEntry, daysLeft: number): Embed {
  return kind === 'open'
    ? {
        title: `⏰ อีก ${daysLeft} วัน จะเปิดจอง ${rangeLine(e)}`,
        description: `${formatThaiDate(e.openDate)} เวลา 10:00 น.\nเตรียม: แอป ThaID ล็อกอินได้ · เลขตัวถัง · ชื่อ-นามสกุลตรงบัตร`,
        color: COLOR.warn,
        footer: { text: FOOTER },
      }
    : {
        title: `⚠️ อีก ${daysLeft} วัน หมดเขตจดทะเบียนเลขหมวด ${e.prefix}`,
        description: `ต้องจดทะเบียนภายใน ${formatThaiDate(e.registerBy)} ไม่งั้นเลขที่จองได้จะหลุด`,
        color: COLOR.warn,
        footer: { text: FOOTER },
      };
}

export function staleEmbed(schedule: Schedule): Embed {
  const last = schedule.entries.map((e) => e.openDate).sort().at(-1)!;
  return {
    title: '🗓️ ตารางที่ตั้งไว้หมดอายุแล้ว',
    description:
      `ตารางล่าสุดที่อ่านได้จบไปตั้งแต่ ${formatThaiDate(last)} แต่ไฟล์บน Drive ยังไม่เปลี่ยน
` +
      `ถ้าขนส่งย้ายไปใช้ไฟล์ใหม่ ให้เปิด ${DLT_SCHEDULE_PAGE} คัดลอกลิงก์ iframe มาใส่ \`scheduleFileId\` ใน watch.config.json`,
    color: COLOR.warn,
    footer: { text: FOOTER },
  };
}

export function openingSoonEmbed(m: Match): Embed {
  const e = m.entry;
  return {
    title: `🚦 อีก 10 นาที เปิดจอง ${rangeLine(e)}`,
    description:
      `เลขที่เล็งไว้วันนี้: ${m.numbers.slice(0, 15).map((n) => `\`${n}\``).join(' ')}${m.numbers.length > 15 ? ' …' : ''}
` +
      `เปิดแอป ThaID ให้พร้อม แล้วเข้า ${DLT_RESERVE_PAGE} ตอน 10:00 น.`,
    color: COLOR.match,
    footer: { text: FOOTER },
  };
}
