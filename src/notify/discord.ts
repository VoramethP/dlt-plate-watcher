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

/** ปลายทางการแจ้ง — webhook หรือ bot (ดู bot.ts) · core.ts ไม่รู้ว่าเป็นแบบไหน */
export interface Notifier {
  send(embeds: Embed[]): Promise<void>;
  close?(): Promise<void>;
}

export function webhookNotifier(webhookUrl: string, fetcher: Fetcher = fetch): Notifier {
  return { send: (embeds) => sendDiscord(webhookUrl, { embeds }, fetcher) };
}

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

/** จัดกลุ่มเลขตามเหตุผล → 1 field ต่อเหตุผล (ผู้ใช้ไม่ต้องอ่าน regex) */
export function groupByReason(m: Match): Array<{ reason: string; numbers: number[] }> {
  const groups = new Map<string, number[]>();
  for (const n of m.numbers) for (const r of m.reasons.get(n)!) groups.set(r, [...(groups.get(r) ?? []), n]);
  const order = new Map(m.reasonOrder.map((r, i) => [r, i]));
  return [...groups.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
    .map(([reason, numbers]) => ({ reason, numbers }));
}

/** เรียงเลขเป็นแถว ๆ ให้พอดีลิมิต 1024 ตัวอักษรของ Discord field */
function numberLines(prefix: string, numbers: number[], maxChars = 1000): string {
  const perRow = 5;
  const rows: string[] = [];
  let shown = 0;
  for (let i = 0; i < numbers.length; i += perRow) {
    const row = numbers.slice(i, i + perRow).map((n) => `\`${prefix} ${n}\``).join('  ');
    if (rows.join('\n').length + row.length + 40 > maxChars) break;
    rows.push(row);
    shown = i + perRow;
  }
  if (shown < numbers.length) rows.push(`…และอีก ${numbers.length - shown} เลข`);
  return rows.join('\n');
}

export function matchEmbed(m: Match): Embed {
  const e = m.entry;
  const groups = groupByReason(m);
  return {
    title: `🎯 เลขที่เล็งไว้จะเปิดจอง ${formatThaiDate(e.openDate)}`,
    description: `${VEHICLE_LABEL[e.vehicleType]}\nช่วงที่เปิด: ${rangeLine(e)} · ตรงเงื่อนไข **${m.numbers.length}** เลข`,
    color: COLOR.match,
    fields: [
      ...groups.map((g) => ({ name: `${g.reason} (${g.numbers.length})`, value: numberLines(e.prefix, g.numbers) })),
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

export function panelEmbed(info: { wishlistCount: number; version: string }): Embed {
  return {
    title: '🛠️ แผงควบคุม dlt-plate-watcher',
    description: 'กดปุ่มด้านล่างแทนการพิมพ์คำสั่งในเทอร์มินัล · คำตอบเห็นเฉพาะคุณ',
    color: COLOR.info,
    fields: [
      { name: '📅 ตารางสัปดาห์นี้', value: '= `npm run schedule`', inline: true },
      { name: '🎯 เลขในฝันรอบนี้', value: '= `npm run match`', inline: true },
      { name: '🔄 เช็คตอนนี้', value: '= `npm run check`', inline: true },
      { name: '🧭 สถานะ bot', value: 'uptime · รอบ check/ปิงถัดไป · wishlist', inline: true },
      { name: 'ตอนนี้', value: `wishlist ${info.wishlistCount} เลข · ตารางเวอร์ชัน ${info.version}`, inline: true },
    ],
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
