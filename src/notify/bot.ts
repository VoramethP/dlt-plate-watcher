// โหมด bot (discord.js gateway) — จำเป็นเมื่ออยากมีปุ่มใต้ข้อความ (ADR-0004)
// ไฟล์นี้เป็นที่เดียวที่แตะ discord.js · ตรรกะของปุ่มอยู่ใน actions.ts
import {
  ActionRowBuilder, Client, Events, GatewayIntentBits, MessageFlags, MessageType, ModalBuilder,
  TextInputBuilder, TextInputStyle, type Interaction, type Message, type SendableChannels,
} from 'discord.js';
import { loadState } from '../state.js';
import { BUTTON, buttonRows, clampReply, COMMAND, panelRows, embedToText, formatHistory, MODAL, MODAL_TEXT, parseNumbers, readPatternRules, shareRow, updateOwners, updateWishlist, wishlistChangeText, type CommandId } from './actions.js';
import type { ScheduleEntry } from '../schedule/types.js';
import { todayBangkok } from '../thai-date.js';
import { guideEmbeds, type Embed, type Notifier } from './discord.js';

export interface BotOptions {
  token: string;
  channelId: string;
  configPath: string;
  statePath: string;
  log?: (msg: string) => void;
  /** ปุ่มลัดคำสั่ง — cli.ts ใส่ให้ เพราะต้องใช้ config/schedule ที่ bot ไม่รู้จัก · คืนข้อความตอบ (ephemeral) */
  commands?: Partial<Record<CommandId, () => Promise<string | { embeds: Embed[] }>>>;
  /** สร้าง embed ของแผงควบคุม (bot เรียกเองตอนต้องโพสต์ใหม่ เช่น หลังแจ้งเตือน หรือ /panel) */
  panel?: () => Promise<Embed>;
  /** true เฉพาะ process `watch` — ให้แผงตามมาอยู่ล่างสุดหลังส่ง · คำสั่งครั้งเดียว (check/preview) ไม่ควรโพสต์แผงซ้อนของ watch */
  stickyPanel?: boolean;
  /** embed 📋 เลขที่เฝ้าอยู่ (รับ owners จาก state) */
  wishlist?: (owners: Record<string, string>) => Promise<Embed>;
  /** แถวตารางของรถประเภทผู้ใช้ — ไว้บอกว่าเลขที่กรอกจะเปิดวันไหน · ไม่มีก็ข้าม */
  myEntries?: () => Promise<ScheduleEntry[]>;
}

export const PANEL_COMMAND = { name: 'panel', description: 'เรียกแผงควบคุม dlt-plate-watcher มาไว้ล่างสุด' };

export interface BotNotifier extends Notifier {
  client: Client;
  /** โพสต์แผงควบคุมไว้ล่างสุด (ลบอันเก่า + ปักหมุดอันใหม่) */
  sendPanel(): Promise<void>;
}

export async function createBotNotifier(opts: BotOptions): Promise<BotNotifier> {
  const log = opts.log ?? console.log;
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  const ready = new Promise<void>((resolve) => client.once(Events.ClientReady, () => resolve()));
  await client.login(opts.token);
  await ready;

  const channel = await client.channels.fetch(opts.channelId);
  if (!channel || !channel.isSendable()) throw new Error(`ช่อง ${opts.channelId} ไม่มีอยู่ หรือ bot ส่งข้อความในช่องนี้ไม่ได้`);
  const target: SendableChannels = channel;
  log(`bot online เป็น ${client.user?.tag} · ช่อง #${'name' in channel ? channel.name : opts.channelId}`);

  // แผงควบคุม: จำ id ไว้เพื่อลบอันเก่าเวลาย้ายมาล่างสุด
  let panelId: string | null = null;
  const sendPanel = async () => {
    if (!opts.panel) return;
    const embed = await opts.panel();
    if (panelId) await target.messages.delete(panelId).catch(() => undefined);
    const msg = await target.send({ embeds: [embed], components: panelRows() });
    panelId = msg.id;
    await pinQuietly(msg, log);
  };

  // /panel เป็น guild command → มีผลทันที (global ใช้เวลาเป็นชั่วโมง) · ต้องเชิญ bot ด้วย scope applications.commands
  if ('guild' in channel && channel.guild && opts.panel) {
    await channel.guild.commands.create(PANEL_COMMAND).catch((err) =>
      log(`ลงทะเบียน /panel ไม่ได้ (${err instanceof Error ? err.message : err}) — เชิญ bot ใหม่ด้วย scope bot + applications.commands ปุ่มยังใช้ได้ปกติ`));
  }

  client.on(Events.InteractionCreate, (i) => handleInteraction(i, opts, client, sendPanel).catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    log(`interaction พลาด: ${msg}`);
    if (i.isRepliable() && !i.replied && !i.deferred) await i.reply({ content: `❌ bot พลาด: ${msg}`, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    else if (i.isRepliable() && i.deferred) await i.editReply(`❌ bot พลาด: ${msg}`).catch(() => undefined);
  }));

  return {
    client,
    async send(embeds: Embed[]) {
      await target.send({ embeds, components: buttonRows() });
      if (opts.stickyPanel) await sendPanel(); // แผงอยู่ล่างสุดเสมอ จะได้กดถึงโดยไม่ต้องเลื่อนหา
    },
    sendPanel,
    async close() {
      await client.destroy();
    },
  };
}

/** ปักหมุดแล้วลบข้อความระบบ "ปักหมุดข้อความ" ทิ้ง จะได้ไม่รก · ต้องมีสิทธิ์ Manage Messages ไม่มีก็ข้าม */
async function pinQuietly(msg: Message, log: (m: string) => void) {
  try {
    await msg.pin();
    const recent = await msg.channel.messages.fetch({ limit: 3 });
    for (const m of recent.values()) if (m.type === MessageType.ChannelPinnedMessage) await m.delete().catch(() => undefined);
  } catch (err) {
    log(`ปักหมุดแผงไม่ได้: ${err instanceof Error ? err.message : err}`);
  }
}

async function handleInteraction(i: Interaction, opts: BotOptions, client: Client, sendPanel: () => Promise<void>) {
  const ephemeral = { flags: MessageFlags.Ephemeral } as const;

  if (i.isChatInputCommand() && i.commandName === PANEL_COMMAND.name) {
    await i.deferReply(ephemeral);
    await sendPanel();
    await i.editReply('🛠️ ย้ายแผงควบคุมมาไว้ล่างสุดแล้ว');
    return;
  }

  if (i.isButton() && i.customId === COMMAND.guide) {
    await i.reply({ embeds: guideEmbeds(), ...ephemeral });
    return;
  }

  if (i.isButton() && i.customId.startsWith('cmd_')) {
    const run = opts.commands?.[i.customId as CommandId];
    if (!run) { await i.reply({ content: 'ปุ่มนี้ยังไม่ได้ต่อคำสั่ง', ...ephemeral }); return; }
    await i.deferReply(ephemeral); // คำสั่งต้องโหลด PDF อาจเกิน 3 วินาที
    try {
      const out = await run();
      await i.editReply(typeof out === 'string' ? clampReply(out) : { embeds: out.embeds.slice(0, 10), components: [shareRow()] });
    } catch (err) {
      await i.editReply(`❌ ${err instanceof Error ? err.message : err}`);
    }
    return;
  }

  if (i.isButton()) {
    switch (i.customId) {
      case BUTTON.addNumber: {
        const modal = new ModalBuilder().setCustomId(MODAL.addNumber).setTitle(MODAL_TEXT.title);
        const add = new TextInputBuilder()
          .setCustomId(MODAL.field).setLabel(MODAL_TEXT.addLabel).setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(MODAL_TEXT.addPlaceholder).setMaxLength(300).setRequired(false);
        const remove = new TextInputBuilder()
          .setCustomId(MODAL.removeField).setLabel(MODAL_TEXT.removeLabel).setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(MODAL_TEXT.removePlaceholder).setMaxLength(300).setRequired(false);
        const exclude = new TextInputBuilder()
          .setCustomId(MODAL.excludeField).setLabel(MODAL_TEXT.excludeLabel).setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(MODAL_TEXT.excludePlaceholder).setMaxLength(300).setRequired(false);
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(add),
          new ActionRowBuilder<TextInputBuilder>().addComponents(exclude),
          new ActionRowBuilder<TextInputBuilder>().addComponents(remove),
        );
        await i.showModal(modal);
        return;
      }
      case BUTTON.showWishlist: {
        if (!opts.wishlist) { await i.reply({ content: 'ยังไม่ได้ต่อปุ่มนี้', ...ephemeral }); return; }
        await i.deferReply(ephemeral);
        const state = await loadState(opts.statePath);
        await i.editReply({ embeds: [await opts.wishlist(state.owners ?? {})], components: [shareRow()] });
        return;
      }
      case BUTTON.share: {
        // ข้อความล้วนใน code block → desktop มีปุ่มคัดลอกมุมขวาบน · มือถือกดค้างเลือกคัดลอก
        const text = i.message.embeds.map((e) => embedToText({ title: e.title, description: e.description, fields: e.fields })).filter(Boolean).join('\n\n') || '(ข้อความนี้ไม่มีเนื้อหาให้คัดลอก)';
        const body = '```\n' + text.slice(0, 1800) + '\n```';
        await i.reply({ content: `📤 คัดลอกได้เลย (ชี้เมาส์ที่กล่อง → ปุ่มคัดลอกมุมขวาบน · มือถือกดค้าง)\n${body}`, ...ephemeral });
        return;
      }
      case BUTTON.showHistory: {
        const state = await loadState(opts.statePath);
        await i.reply({ content: formatHistory(state), ...ephemeral });
        return;
      }
      case BUTTON.clearHistory: {
        await i.deferReply(ephemeral);
        const deleted = await deleteOwnMessages(i.channelId, client, i.message.id);
        await i.editReply(`ลบข้อความเก่าของ bot ไป ${deleted} ข้อความ (เก็บข้อความนี้ไว้)`);
        return;
      }
    }
  }

  if (i.isModalSubmit() && i.customId === MODAL.addNumber) {
    await i.deferReply(ephemeral); // อาจต้องโหลดตารางเพื่อบอกวันเปิด
    const add = parseNumbers(i.fields.getTextInputValue(MODAL.field) ?? '');
    const remove = parseNumbers(i.fields.getTextInputValue(MODAL.removeField) ?? '');
    const exclude = parseNumbers(i.fields.getTextInputValue(MODAL.excludeField) ?? '');
    const change = await updateWishlist(opts.configPath, add.valid, remove.valid, exclude.valid);
    const user = i.user.displayName || i.user.username;
    const ownersBefore = await updateOwners(opts.statePath, user, change.added, [...change.removed, ...change.excluded]);
    const entries = opts.myEntries ? await opts.myEntries().catch(() => []) : [];
    const rules = await readPatternRules(opts.configPath).catch(() => ({ patterns: [], digitSums: [] }));
    await i.editReply(clampReply(wishlistChangeText(change, [...add.invalid, ...exclude.invalid, ...remove.invalid], ownersBefore, user, entries, todayBangkok(), rules)));
  }
}

/** ลบข้อความของ bot เองในช่อง (ยกเว้น keepId) · bulkDelete ใช้ได้กับข้อความ < 14 วัน ที่เหลือลบทีละอัน */
async function deleteOwnMessages(channelId: string, client: Client, keepId: string): Promise<number> {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return 0;
  const fetched = await channel.messages.fetch({ limit: 100 });
  const mine = [...fetched.values()].filter((m: Message) => m.author.id === client.user?.id && m.id !== keepId);
  if (!mine.length) return 0;
  const bulk = await channel.bulkDelete(mine, true);
  const remaining = mine.filter((m) => !bulk.has(m.id));
  for (const m of remaining) await m.delete().catch(() => undefined);
  return bulk.size + remaining.length;
}
