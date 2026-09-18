// โหมด bot (discord.js gateway) — จำเป็นเมื่ออยากมีปุ่มใต้ข้อความ (ADR-0004)
// ไฟล์นี้เป็นที่เดียวที่แตะ discord.js · ตรรกะของปุ่มอยู่ใน actions.ts
import {
  ActionRowBuilder, Client, Events, GatewayIntentBits, MessageFlags, MessageType, ModalBuilder,
  TextInputBuilder, TextInputStyle, type Interaction, type Message, type SendableChannels,
} from 'discord.js';
import { loadState } from '../state.js';
import { addNumberToConfig, BUTTON, buttonRow, clampReply, COMMAND, commandRow, formatHistory, MODAL, type CommandId } from './actions.js';
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
    const msg = await target.send({ embeds: [embed], components: [commandRow()] });
    panelId = msg.id;
    await pinQuietly(msg, log);
  };

  // /panel เป็น guild command → มีผลทันที (global ใช้เวลาเป็นชั่วโมง) · ต้องเชิญ bot ด้วย scope applications.commands
  if ('guild' in channel && channel.guild && opts.panel) {
    await channel.guild.commands.create(PANEL_COMMAND).catch((err) =>
      log(`ลงทะเบียน /panel ไม่ได้ (${err instanceof Error ? err.message : err}) — เชิญ bot ใหม่ด้วย scope bot + applications.commands ปุ่มยังใช้ได้ปกติ`));
  }

  client.on(Events.InteractionCreate, (i) => handleInteraction(i, opts, client, sendPanel).catch((err) => log(`interaction พลาด: ${err instanceof Error ? err.message : err}`)));

  return {
    client,
    async send(embeds: Embed[]) {
      await target.send({ embeds, components: [buttonRow()] });
      await sendPanel(); // แผงอยู่ล่างสุดเสมอ จะได้กดถึงโดยไม่ต้องเลื่อนหา
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
      await i.editReply(typeof out === 'string' ? clampReply(out) : { embeds: out.embeds.slice(0, 10) });
    } catch (err) {
      await i.editReply(`❌ ${err instanceof Error ? err.message : err}`);
    }
    return;
  }

  if (i.isButton()) {
    switch (i.customId) {
      case BUTTON.addNumber: {
        const modal = new ModalBuilder().setCustomId(MODAL.addNumber).setTitle('เพิ่มเลขที่อยากได้ (เฝ้าให้ ไม่ได้จองแทน)');
        const input = new TextInputBuilder()
          .setCustomId(MODAL.field).setLabel('เลขทะเบียน 1–9999').setStyle(TextInputStyle.Short)
          .setPlaceholder('เช่น 5555').setMinLength(1).setMaxLength(4).setRequired(true);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        await i.showModal(modal);
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
    const r = await addNumberToConfig(opts.configPath, i.fields.getTextInputValue(MODAL.field));
    if (!r.ok) { await i.reply({ content: `❌ ${r.error}`, ...ephemeral }); return; }
    await i.reply({
      content: r.already
        ? `ℹ️ เลข **${r.number}** อยู่ใน wishlist อยู่แล้ว (ทั้งหมด ${r.total} เลข)`
        : `✅ เพิ่มเลข **${r.number}** ลง wishlist แล้ว (ทั้งหมด ${r.total} เลข) · จะแจ้งเมื่อเลขนี้เปิดจอง — การจองยังต้องทำเองผ่าน ThaID`,
      ...ephemeral,
    });
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
