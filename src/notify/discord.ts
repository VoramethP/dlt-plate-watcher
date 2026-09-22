// ส่งข้อความเข้า Discord ผ่าน webhook — ไม่ต้องสร้าง bot ไม่ต้องขอ intent
import type { Match } from '../match.js';
import { DLT_RESERVE_PAGE, DLT_SCHEDULE_PAGE, type Fetcher } from '../schedule/fetch.js';
import type { Schedule, ScheduleEntry } from '../schedule/types.js';
import { VEHICLE_LABEL } from '../schedule/types.js';
import { daysBetween, formatThaiDate, formatThaiDateShort } from '../thai-date.js';
import { matchSchedule } from '../match.js';
import type { Config } from '../config.js';
import { bestSumNumbers, EMPTY_NUMEROLOGY, groupNumbersByMeaning, meaningLine, type Numerology } from '../numerology.js';
import { auctionIndex, type AuctionIndex } from '../auction.js';
import type { SuggestResult } from '../suggest.js';

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

/** ปลายทางการแจ้ง — webhook (บนเครื่อง) หรือ Discord REST ด้วย bot token (ดู rest.ts) · core.ts ไม่รู้ว่าเป็นแบบไหน */
export interface Notifier {
  send(embeds: Embed[]): Promise<void>;
  /** เรียกครั้งเดียวหลังส่งครบทุกข้อความ (restNotifier ใช้ย้ายแผงมาล่างสุด) */
  done?(): Promise<void>;
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

/**
 * เรียงเลขเป็นแถว ๆ ให้พอดีลิมิต 1024 ตัวอักษรของ Discord field
 * ไม่ใส่หมวดในชิป (หัวการ์ดบอกแล้ว) และคั่นด้วย · — ผู้ใช้บอกว่า "8ขฉ 5050 8ขฉ 5151" ติดกันอ่านยาก
 */
function numberLines(_prefix: string, numbers: number[], maxChars = 1000): string {
  const perRow = 5;
  const rows: string[] = [];
  let shown = 0;
  for (let i = 0; i < numbers.length; i += perRow) {
    const row = numbers.slice(i, i + perRow).map((n) => `\`${n}\``).join(' · ');
    if (rows.join('\n').length + row.length + 40 > maxChars) break;
    rows.push(row);
    shown = i + perRow;
  }
  if (shown < numbers.length) rows.push(`…และอีก ${numbers.length - shown} เลข`);
  return rows.join('\n');
}

/** 🔨 ช่องเลขประมูล — จัดกลุ่มตามชื่อกลุ่มในประกาศ ผู้ใช้จะได้รู้ว่าทำไมเลขนี้จองไม่ได้ (ADR-0006) */
export function auctionField(auction: Match['auction']): NonNullable<Embed['fields']>[number] {
  const byGroup = new Map<string, number[]>();
  for (const a of auction) byGroup.set(a.group, [...(byGroup.get(a.group) ?? []), a.n]);
  const lines = [...byGroup.entries()].map(([group, ns]) => `**${group}** ${ns.map((n) => `\`${n}\``).join(' · ')}`);
  return {
    name: `🔨 ต้องประมูล จองออนไลน์ไม่ได้ (${auction.length})`,
    value: `${fitField(lines, 'กลุ่ม', 900)}\n-# ขนส่งกันเลขกลุ่มนี้ไว้ประมูลที่ tabienrod.com — ไม่ต้องรอกดตอน 10:00`,
  };
}

export function matchEmbed(m: Match, numerology: Numerology = EMPTY_NUMEROLOGY): Embed {
  const e = m.entry;
  const groups = groupByReason(m);
  // 🔮 ความหมายตามตารางของผู้ใช้ — จัดกลุ่มตามสาย เลขหนึ่งอาจอยู่หลายสาย · ไม่มีตาราง/ไม่เข้าสาย = ไม่แสดง
  const best = bestSumNumbers(e.prefix, m.numbers, numerology);
  const meanings = [
    ...(best.length ? [`⭐ **ผลรวมทั้งป้ายระดับดีมาก** (นับหมวด ${e.prefix} ด้วย)\n${best.map(({ n, sum }) => `\`${n}\`=${sum}`).join(' · ')}`] : []),
    ...groupNumbersByMeaning(e.prefix, m.numbers, numerology).map((g) => `${g.group.emoji} **${g.group.name}**\n${numberLines(e.prefix, g.numbers, 300)}`),
  ];
  const auctionNote = m.auction.length ? ` · 🔨 ต้องประมูลอีก **${m.auction.length}** เลข` : '';
  return {
    title: `🎯 เลขที่เล็งไว้จะเปิดจอง ${formatThaiDate(e.openDate)}`,
    description: `${VEHICLE_LABEL[e.vehicleType]}\nช่วงที่เปิด: ${rangeLine(e)} · จองออนไลน์ได้ **${m.numbers.length}** เลข${auctionNote} · ทุกเลขด้านล่างคือหมวด **${e.prefix}**`,
    color: m.numbers.length ? COLOR.match : COLOR.warn,
    fields: [
      ...groups.map((g) => ({ name: `${g.reason} (${g.numbers.length})`, value: numberLines(e.prefix, g.numbers) })),
      ...(m.auction.length ? [auctionField(m.auction)] : []),
      ...(meanings.length ? [{ name: `🔮 เลขศาสตร์ (รวบรวมจาก ${numerology.sources.length || 'หลาย'} แหล่ง · ดู numerology.json)`, value: meanings.join('\n').slice(0, 1024) }] : []),
      { name: 'เปิดจอง', value: '10:00 – 16:00 น. ที่ reserve.dlt.go.th', inline: true },
      { name: 'ต้องจดทะเบียนภายใน', value: formatThaiDate(e.registerBy, false), inline: true },
      ...(e.note ? [{ name: 'หมายเหตุจากขนส่ง', value: e.note }] : []),
    ],
    footer: { text: FOOTER },
  };
}

/**
 * ตารางทั้งสัปดาห์เป็น embed — ใช้ทั้งตอน "ตารางรอบใหม่" และปุ่ม 📅 บนแผง
 * มี config → ทำเครื่องหมาย 🎯 วันที่มีเลขในฝัน และ "← รถของคุณ" · มี today → ไอคอนผ่านแล้ว/วันนี้/กำลังมา
 */
export function scheduleEmbed(schedule: Schedule, opts: { title?: string; config?: Config; today?: string; auction?: AuctionIndex } = {}): Embed {
  const byType = new Map<string, ScheduleEntry[]>();
  for (const e of schedule.entries) byType.set(e.vehicleType, [...(byType.get(e.vehicleType) ?? []), e]);
  const matchDays = new Map<string, { hit: number; auction: number }>();
  if (opts.config) for (const m of matchSchedule(schedule.entries, opts.config, opts.auction)) matchDays.set(`${m.entry.vehicleType}:${m.entry.openDate}`, { hit: m.numbers.length, auction: m.auction.length });
  const dates = schedule.entries.map((e) => e.openDate).sort();
  const first = dates[0]; const last = dates.at(-1)!;
  const status = (e: ScheduleEntry) => {
    if (!opts.today) return '▫️';
    const d = daysBetween(opts.today, e.openDate);
    return d < 0 ? '✅' : d === 0 ? '🔥' : '⏳';
  };
  const row = (e: ScheduleEntry) => {
    const hit = matchDays.get(`${e.vehicleType}:${e.openDate}`);
    // 🎯 = จองออนไลน์ได้ · 🔨 = ตรงเงื่อนไขแต่เป็นเลขประมูล (บอกไว้ไม่ให้เข้าใจผิดว่าวันนั้นไม่มีอะไรเลย)
    const mark = hit ? `${hit.hit ? ` 🎯 ${hit.hit} เลข` : ''}${hit.auction ? ` 🔨 ${hit.auction}` : ''}` : '';
    return `${status(e)} **${formatThaiDateShort(e.openDate)}** · ${rangeLine(e)}${mark}`;
  };
  const registerDays = daysBetween(schedule.entries[0].openDate, schedule.entries[0].registerBy);
  return {
    title: opts.title ?? '📅 ขนส่งออกตารางเปิดจองรอบใหม่',
    description: `สัปดาห์ **${formatThaiDate(first, false)} – ${formatThaiDate(last, false)}** · เปิดจอง 10:00–16:00 น. · จดทะเบียนภายใน ${registerDays} วันหลังวันเปิด` +
      (opts.today ? '\n✅ ผ่านไปแล้ว · 🔥 วันนี้ · ⏳ กำลังมา' : ''),
    color: COLOR.info,
    fields: [...byType.entries()].map(([type, list]) => ({
      name: `${VEHICLE_LABEL[type as keyof typeof VEHICLE_LABEL]}${opts.config?.vehicleType === type ? '  ← รถของคุณ' : ''}`,
      value: list.map(row).join('\n'),
    })),
    footer: { text: `${FOOTER} · อัปเดต ${schedule.version}` },
  };
}

/**
 * ต่อบรรทัดจนกว่าจะชนลิมิต 1024 ของ field แล้วปิดด้วย "…และอีก N" — นับตัวอักษรจริง ไม่ใช่จำนวนบรรทัด
 * (เคยพัง 20 ก.ย.: 8 เลข × บรรทัดเลขศาสตร์ ↳ เกิน 1024 → Discord ตอบ 400 BASE_TYPE_MAX_LENGTH)
 */
export function fitField(lines: string[], unit: string, max = 1000): string {
  const out: string[] = [];
  let len = 0;
  for (const line of lines) {
    if (len + line.length + 1 > max) break;
    out.push(line); len += line.length + 1;
  }
  return out.join('\n') + (out.length < lines.length ? `\n…และอีก ${lines.length - out.length} ${unit}` : '');
}

/** ลิมิตข้อความเดียวของ Discord: 10 embed และ "ตัวอักษรของทุก embed รวมกัน" 6000 — เผื่อไว้ 200 เพราะนับฝั่ง Discord อาจต่างเล็กน้อย */
export const MAX_EMBEDS_PER_MESSAGE = 10;
export const MESSAGE_CHAR_BUDGET = 5800;

/** ตัวอักษรที่ Discord นับต่อ embed — title + description + ชื่อ/ค่าของทุก field + footer */
export function embedChars(e: Embed): number {
  return (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0) +
    (e.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0);
}

/** embed เดียวก็เกินงบแล้ว (เหตุผลเยอะ × เลขเยอะ) → ตัด field ท้าย ๆ ทิ้ง ดีกว่าส่งไม่ออกทั้งใบ */
export function clampEmbed(e: Embed, budget = MESSAGE_CHAR_BUDGET): Embed {
  if (embedChars(e) <= budget) return e;
  const fields: NonNullable<Embed['fields']> = [];
  let len = embedChars({ ...e, fields: [] }) + 40; // 40 = เผื่อบรรทัด "…ตัดไป N ช่อง"
  for (const f of e.fields ?? []) {
    if (len + f.name.length + f.value.length > budget) break;
    fields.push(f); len += f.name.length + f.value.length;
  }
  const cut = (e.fields?.length ?? 0) - fields.length;
  return { ...e, fields: [...fields, { name: '…', value: `ยาวเกินที่ Discord รับได้ · ตัดไป ${cut} ช่อง` }] };
}

/**
 * แบ่ง embed เป็นข้อความ ๆ ให้พอดีทั้งจำนวน (10) และตัวอักษรรวม (6000)
 * เคยพัง 21 ก.ย.: ตารางรอบใหม่ = 5 การ์ด match + เตือน รวม 6230 ตัวอักษร → Discord ตอบ 400 MAX_EMBED_SIZE_EXCEEDED
 */
export function chunkEmbeds(embeds: Embed[], budget = MESSAGE_CHAR_BUDGET): Embed[][] {
  const out: Embed[][] = [];
  let cur: Embed[] = [];
  let len = 0;
  for (const raw of embeds) {
    const e = clampEmbed(raw, budget);
    const n = embedChars(e);
    if (cur.length && (cur.length >= MAX_EMBEDS_PER_MESSAGE || len + n > budget)) { out.push(cur); cur = []; len = 0; }
    cur.push(e); len += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** 📋 เลขที่เฝ้าอยู่ — ทุกเลขใน wishlist พร้อมว่าใครเพิ่ม และเกี่ยวกับตารางสัปดาห์นี้ยังไง */
export function wishlistEmbed(config: Config, owners: Record<string, string>, entries: ScheduleEntry[], today: string, numerology: Numerology = EMPTY_NUMEROLOGY, auction: AuctionIndex = auctionIndex(undefined, config.wishlist.auction ?? [])): Embed {
  const w = config.wishlist;
  const statusOf = (n: number) => {
    const slot = entries.find((e) => n >= e.from && n <= e.to);
    if (!slot) return '🔭 ยังไม่ถึงคิว';
    const d = daysBetween(today, slot.openDate);
    return d < 0 ? `⏪ เปิดไปแล้ว ${formatThaiDateShort(slot.openDate)}` : d === 0 ? `🔥 เปิด**วันนี้** ${slot.prefix}` : `⏳ ${formatThaiDateShort(slot.openDate)} ${slot.prefix} (อีก ${d} วัน)`;
  };
  const prefixOf = (n: number) => entries.find((e) => n >= e.from && n <= e.to)?.prefix ?? '';
  // เลขประมูลแยกช่องของมันเอง — อยู่ปนกับเลขที่รอเปิดจองแล้วสับสน (ADR-0006)
  const wanted = w.numbers.filter((n) => !auction.has(n));
  const locked = w.numbers.filter((n) => auction.has(n));
  const numberLines = wanted.map((n) => { const mean = meaningLine(prefixOf(n), n, numerology); return `\`${n}\` ${statusOf(n)}${owners[n] ? ` · 👤 ${owners[n]}` : ''}${mean ? `\n   ↳ ${mean}` : ''}`; });
  const fields: Embed['fields'] = [
    { name: `✅ จองออนไลน์ได้ (${wanted.length})`, value: numberLines.length ? fitField(numberLines, 'เลข') : '(ยังไม่มี · กด 🔢 เพื่อเพิ่ม)' },
  ];
  if (locked.length) fields.push(auctionField(locked.map((n) => ({ n, group: auction.get(n)! }))));
  if (w.patterns.length) fields.push({ name: `รูปแบบเลขที่เฝ้า (${w.patterns.length})`, value: w.patterns.map((p) => `• ${p.name}`).join('\n'), inline: true });
  if (w.digitSums.length) fields.push({ name: 'ผลรวมเลขที่เฝ้า', value: w.digitSums.join(', '), inline: true });
  const exclude = w.exclude ?? [];
  if (exclude.length) fields.push({ name: `🚫 ไม่อยากได้ (${exclude.length})`, value: exclude.map((n) => `\`${n}\``).join(' ') + '\n-# ตัดออกจากทุกรูปแบบ · เอากลับด้วยการใส่ในช่องเพิ่ม' });
  return {
    title: '📋 เลขที่เฝ้าอยู่',
    description: `${VEHICLE_LABEL[config.vehicleType]}\n🔭 ยังไม่ถึงคิว · ⏳ กำลังมา · 🔥 วันนี้ · ⏪ เปิดไปแล้ว`,
    color: COLOR.info,
    fields,
    footer: { text: 'กรอกผิด → กด 🔢 แล้วใส่เลขในช่อง "ลบ" · รูปแบบเลขแก้ได้ใน watch.config.json' },
  };
}

export interface DailyInfo {
  config: Config;
  /** แถวของวันนี้ (รถประเภทผู้ใช้) */
  entry: ScheduleEntry;
  today: string;
  /** เลขใน wishlist ที่เปิดวันนี้ — null = ไม่มี */
  mine?: Match | null;
  suggest: SuggestResult;
  /** วันเปิดถัดไปในตารางชุดนี้ · null = สัปดาห์นี้หมดแล้ว */
  tomorrow?: { entry: ScheduleEntry; mine: number } | null;
}

/**
 * 📣 การ์ดประจำวัน — โพสต์ 09:30 ทุกวันที่มีรอบเปิด ทุกคนในห้องเห็น แล้วลบตัวเอง 23:50
 * ของผู้ใช้มาก่อนของ bot เสมอ · ปิดท้ายด้วยรอบพรุ่งนี้ (แทนข้อความ ⏰ เตือนล่วงหน้าที่ยุบมารวมไว้ตรงนี้)
 */
export function dailyEmbed(info: DailyInfo): Embed {
  const { entry: e, suggest } = info;
  const mineNumbers = info.mine?.numbers ?? [];
  const fields: NonNullable<Embed['fields']> = [];

  if (mineNumbers.length) {
    const lines = mineNumbers.map((n) => `\`${n}\` ${info.mine!.reasons.get(n)!.join(' · ')}`);
    fields.push({ name: `🎯 เลขในฝันของคุณที่เปิดวันนี้ (${mineNumbers.length})`, value: fitField(lines, 'เลข') });
  }

  for (const { group, picks } of suggest.groups) {
    const lines = picks.map((s) => {
      const via = s.groups.find((g) => g.group.name === group.name)!;
      const also = s.groups.filter((g) => g.group.name !== group.name).map((g) => g.group.emoji).join('');
      const votes = via.votes > 1 ? ` · ${via.votes} แหล่งตรงกัน` : '';
      const grade = s.grade ? ` · ผลรวม ${s.sum} ${s.grade}` : '';
      return `\`${s.n}\` ${via.via.join(' · ')}${votes}${grade}${also ? ` · ${also}` : ''}`;
    });
    fields.push({ name: `${group.emoji} ${group.name}`, value: fitField(lines, 'เลข', 900) });
  }

  if (!fields.length) fields.push({ name: 'วันนี้', value: 'ไม่มีเลขที่เข้าเกณฑ์ในช่วงนี้ · กด 📅 ดูวันอื่น' });

  const t = info.tomorrow;
  fields.push({
    name: '🔜 พรุ่งนี้',
    value: t
      ? `เปิด **${t.entry.prefix}** ${t.entry.from}–${t.entry.to} · ${formatThaiDateShort(t.entry.openDate)}${t.mine ? ` · เลขในฝันคุณ **${t.mine}** เลข` : ''}\nเตรียม: แอป ThaID ล็อกอินได้ · เลขตัวถัง · ชื่อ-นามสกุลตรงบัตร`
      : 'สัปดาห์นี้หมดแล้ว · ตารางรอบใหม่ออกเช้าวันจันทร์',
  });

  const extra = suggest.eligible - suggest.groups.reduce((n, g) => n + g.picks.length, 0);
  return {
    title: `📣 เลขน่าสนใจวันนี้ · ${formatThaiDate(e.openDate)}`,
    description: `${VEHICLE_LABEL[e.vehicleType]}\nวันนี้เปิด **${e.prefix}** ${e.from}–${e.to} เวลา 10:00–16:00 น. · จองออนไลน์ได้ **${suggest.bookable}** เลข${suggest.auction ? ` · 🔨 กันไว้ประมูล ${suggest.auction}` : ''}\n` +
      `-# bot คัดจากตารางเลขศาสตร์ใน numerology.json (ตัดเลขที่ตำราบอกว่าควรเลี่ยงออกแล้ว)${extra > 0 ? ` · เข้าเกณฑ์ทั้งหมด ${suggest.eligible} เลข` : ''} — ความเชื่อ ไม่ใช่ข้อเท็จจริง`,
    color: mineNumbers.length ? COLOR.match : COLOR.info,
    fields,
    footer: { text: FOOTER },
  };
}

/** ⚠️ ใกล้หมดเขตจดทะเบียน — เตือนก่อนเปิดจองย้ายไปอยู่ช่อง "🔜 พรุ่งนี้" ของการ์ดประจำวันแล้ว (ADR-0007) */
export function reminderEmbed(kind: 'deadline', e: ScheduleEntry, daysLeft: number): Embed {
  return {
    title: `⚠️ อีก ${daysLeft} วัน หมดเขตจดทะเบียนเลขหมวด ${e.prefix}`,
    description: `ต้องจดทะเบียนภายใน ${formatThaiDate(e.registerBy)} ไม่งั้นเลขที่จองได้จะหลุด`,
    color: COLOR.warn,
    footer: { text: FOOTER },
  };
}

export interface PanelInfo {
  config: Config;
  /** แถวตารางของรถประเภทผู้ใช้ (ว่างถ้าโหลดไม่ได้) */
  entries: ScheduleEntry[];
  matches: Match[];
  today: string;
  /** จำนวนเลขใน wishlist ที่เป็นเลขประมูล — โชว์ในช่อง 📋 ให้รู้ว่าที่เฝ้าอยู่จองได้จริงกี่เลข */
  auctionCount?: number;
  /** จาก meta.lastCheckAt — serverless ไม่มี uptime ให้โชว์ (ADR-0005) */
  lastCheckAt?: Date;
  version?: string;
  stale?: boolean;
}

/** ตารางเวลาที่โชว์บนแผง — แก้ที่นี่ที่เดียวเวลา cron เปลี่ยน (มีเทสกันลืม) */
export const CRON_TIMES = 'รอบถัดไป 09:30 / ปิง 09:50 / ปิดวัน 23:50';

const bkkTime = (d: Date) => d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** 🏠 landing panel — อยู่ล่างสุดของช่องเสมอ ตอบ "ตอนนี้เป็นยังไง ต้องทำอะไร" โดยไม่ต้องกด */
export function panelEmbed(info: PanelInfo): Embed {
  const { config: c, matches, today } = info;
  const w = c.wishlist;
  const todayMatch = matches.find((m) => m.entry.openDate === today);
  const next = matches.filter((m) => m.entry.openDate > today).sort((a, b) => a.entry.openDate.localeCompare(b.entry.openDate))[0];
  const line = (m: Match) => `**${m.entry.prefix}** ${m.entry.from}–${m.entry.to} · เลขในฝัน **${m.numbers.length}** เลข`;
  let headline: string; let color: number;
  if (info.stale) { headline = '🗓️ ตารางที่ตั้งไว้หมดอายุแล้ว — กด 📅 ดูรายละเอียด'; color = COLOR.closed; }
  else if (!info.entries.length) { headline = '⚠️ โหลดตารางไม่ได้ในรอบนี้ — กด 🔄 ลองใหม่'; color = COLOR.warn; }
  else if (todayMatch) { headline = `🔥 **วันนี้เปิดจอง** ${line(todayMatch)} · 10:00–16:00 น.`; color = 0xef4444; }
  else if (next) { headline = `⏳ เลขในฝันเปิดครั้งถัดไป **${formatThaiDateShort(next.entry.openDate)}** (อีก ${daysBetween(today, next.entry.openDate)} วัน) · ${line(next)}`; color = COLOR.match; }
  else { headline = '😴 สัปดาห์นี้ไม่มีเลขในฝันเปิดแล้ว · รอตารางรอบหน้า (เช้าวันจันทร์)'; color = COLOR.info; }

  const nums = w.numbers.slice(0, 10).map((n) => `\`${n}\``).join(' ') + (w.numbers.length > 10 ? ` …+${w.numbers.length - 10}` : '');
  const exclude = w.exclude ?? [];
  const summary = `${w.numbers.length} เลข · ${w.patterns.length} รูปแบบ${w.digitSums.length ? ` · ผลรวม ${w.digitSums.join(',')}` : ''}${exclude.length ? ` · 🚫 ${exclude.length}` : ''}${info.auctionCount ? ` · 🔨 ${info.auctionCount}` : ''}`;
  const week = info.entries.length ? `${formatThaiDateShort(info.entries[0].openDate)} – ${formatThaiDateShort(info.entries.at(-1)!.openDate)}` : '—';

  return {
    title: '🏠 dlt-plate-watcher',
    description: `${headline}\n${VEHICLE_LABEL[c.vehicleType]}`,
    color,
    fields: [
      { name: '📋 เฝ้าอยู่', value: `${summary}\n${nums || '(ยังไม่ระบุเลข · กด 🔢)'}` },
      // เวลาต้องตรงกับ job บน cron-job.org (ADR-0007) — ไม่มี Vercel Cron 08:00 แล้ว
      { name: '🧭 bot', value: `เช็คล่าสุด ${info.lastCheckAt ? bkkTime(info.lastCheckAt) : 'ยังไม่เช็ค'}\n${CRON_TIMES}`, inline: true },
      { name: '📅 ตาราง', value: `${week}\n${info.version ? `อัปเดต ${info.version.replace(/:\d\d GMT$/, '')}` : 'โหลดไม่ได้'}`, inline: true },
      { name: 'ปุ่ม', value: 'แถวบน = ทำ · แถวล่าง = ดู · ทุกคำตอบเห็นเฉพาะคุณ · หาแผงไม่เจอพิมพ์ `/panel`' },
    ],
    footer: { text: FOOTER },
  };
}

/** คู่มือปุ่มทั้งหมด — ตอบแบบ ephemeral เมื่อกด ❓ คู่มือ บนแผงควบคุม (เนื้อหาเดียวกับ docs/UI-GUIDE.md) */
export function guideEmbeds(): Embed[] {
  return [
    {
      title: '❓ คู่มือปุ่ม — ข้อความแจ้งเตือน',
      description: '📣 **การ์ดประจำวัน** โพสต์ 09:30 ทุกวันที่มีรอบเปิดจอง: เลขในฝันของคุณที่เปิดวันนี้ + เลขที่ bot คัดให้จากช่วงของวันนั้น (สายละ 3) + รอบพรุ่งนี้ · **ลบตัวเอง 23:50** เพื่อรอใบวันถัดไป\nใต้การ์ดมี 🔢 เพิ่มเลขที่ถูกใจ · 📤 แชร์เลข · 🌐 เข้าสู่เว็บไซต์ · ปุ่มอื่นอยู่ที่ landing panel ล่างสุดของช่อง',
      color: COLOR.match,
      fields: [
        { name: '🔢 กรอกเลขที่อยากจอง', value: 'ฟอร์ม 4 ช่อง: **เพิ่ม** หลายเลขคั่นด้วย , หรือเว้นวรรค · **ไม่อยากได้** ตัดเลขออกจากทุกรูปแบบ (จองได้แล้ว / ไม่ชอบ) · **🔨 กดจองไม่ได้** เลขที่ขนส่งกันไว้ประมูล · **ลบ** ออกจากรายการ\nbot ตอบรายเลขว่าเปิดจองวันไหน ซ้ำไหม ช่วงนั้นผ่านไปแล้วไหม ใครเล็งไว้ก่อน และ 💡 ถ้ารูปแบบครอบอยู่แล้ว\n⚠️ ไม่ได้จองแทน — การจองต้องทำเองผ่าน ThaID' },
        { name: '📋 เลขที่เฝ้าอยู่', value: 'รายการทุกเลขใน wishlist ตอนนี้ ใครเพิ่ม และจะเปิดจองวันไหน · แยก ✅ จองออนไลน์ได้ กับ 🔨 ต้องประมูล · ใช้ตรวจว่าลืมลบเลขไหนไหม' },
        { name: '📤 แชร์เลข', value: 'ข้อความนี้ในรูปข้อความล้วนใน code block → ชี้เมาส์แล้วกดคัดลอก (มือถือกดค้าง) เอาไปส่งให้ครอบครัวช่วยเลือกได้' },
        { name: '🧹 ลบประวัติแชตเก่า', value: 'ลบข้อความเก่าของ bot ในช่องนี้ (สูงสุด 100 ข้อความล่าสุด) เก็บข้อความที่คุณกดไว้ · ไม่แตะข้อความของคนอื่น' },
        { name: '🌐 เข้าสู่เว็บไซต์', value: 'ลิงก์ไปหน้าจองของกรมขนส่ง reserve.dlt.go.th เปิด 10:00–16:00 น. ตามตาราง ต้องยืนยันตัวตน ThaID ก่อนจอง' },
      ],
    },
    {
      title: '🏠 คู่มือปุ่ม — landing panel',
      description: 'แผงหลักอยู่ล่างสุดของช่องเสมอ บอกสถานะวันนี้ + wishlist + bot โดยไม่ต้องกด · หาไม่เจอพิมพ์ `/panel`\nแถวบน = ทำ (🔢 📋 🧹 🌐) · แถวล่าง = ดู (📅 🎯 🔄 📜 ❓)',
      color: COLOR.info,
      fields: [
        { name: '📅 ตารางสัปดาห์นี้', value: '= `npm run schedule` · ตารางเปิดจองทั้ง 3 ประเภทรถ วันไหนหมวดอะไร ช่วงเลขเท่าไหร่ จดภายในวันไหน' },
        { name: '🎯 เลขในฝันรอบนี้', value: '= `npm run match` · เลขใน wishlist ที่จะเปิดจองสัปดาห์นี้ พร้อมเหตุผลว่าตรงเงื่อนไขไหน · เลขที่ต้องประมูลแยกอยู่ช่อง 🔨 ท้ายการ์ด\nbot ไม่ยิงการ์ดนี้เข้าห้องอัตโนมัติแล้ว — การ์ดประจำวัน 📣 ทำหน้าที่แทน กดเองเมื่อไหร่ก็ได้' },
        { name: '🔄 เช็คตอนนี้', value: '= `npm run check` · ดึงตารางล่าสุดแล้วส่งแจ้งเตือนเฉพาะที่ยังไม่เคยส่ง (ปกติทำเองทุกวัน 08:00)' },
        { name: '📜 ดูประวัติแชต', value: 'เหตุการณ์ล่าสุด 15 รายการ: bot แจ้งอะไร ใครเพิ่ม/ลบเลขไหน ใครลบแชต (ล่าสุดก่อน) เห็นเฉพาะคุณ' },
        { name: '❓ คู่มือ', value: 'ข้อความนี้' },
        { name: '🔨 ทำไมบางเลขขึ้นว่า "ต้องประมูล"', value: 'ขนส่งกันเลขสวย **301 หมายเลขต่อหมวด** ไว้ประมูลที่ tabienrod.com (เลขตอง เลขเรียง เลขคู่ เลขหลักพัน ฯลฯ) เลขกลุ่มนี้ไม่เข้าระบบจองออนไลน์ตั้งแต่แรก bot จึงแยกไว้ไม่ให้เสียเวลารอกด\nอิงตามประกาศกรมการขนส่งทางบก (ดู `auction-rules.json`) ไม่ได้ถามระบบขนส่ง · เจอเลขอื่นที่กดไม่ได้ ใส่ในช่อง 🔨 ของปุ่ม 🔢 ได้' },
        { name: 'สิ่งที่ bot จะไม่ทำ', value: 'ไม่ล็อกอิน ThaID · ไม่กรอกเลขบัตร · ไม่กดจองแทน · ไม่เช็คกับระบบขนส่งว่าเลขถูกจองแล้วหรือยัง' },
      ],
      footer: { text: FOOTER },
    },
  ];
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
