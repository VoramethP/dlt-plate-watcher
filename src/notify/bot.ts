// โหมด bot (discord.js gateway) — จำเป็นเมื่ออยากมีปุ่มใต้ข้อความ (ADR-0004)
// ไฟล์นี้เป็นที่เดียวที่แตะ discord.js · ตรรกะของปุ่มอยู่ใน actions.ts
import {
  ActionRowBuilder, Client, Events, GatewayIntentBits, MessageFlags, ModalBuilder,
  TextInputBuilder, TextInputStyle, type Interaction, type Message, type SendableChannels,
} from 'discord.js';
import { loadState } from '../state.js';
import { addNumberToConfig, BUTTON, buttonRow, clampReply, commandRow, formatHistory, MODAL, type CommandId } from './actions.js';
import type { Embed, Notifier } from './discord.js';

export interface BotOptions {
  token: string;
  channelId: string;
  configPath: string;
  statePath: string;
  log?: (msg: string) => void;
  /** ปุ่มลัดคำสั่ง — cli.ts ใส่ให้ เพราะต้องใช้ config/schedule ที่ bot ไม่รู้จัก · คืนข้อความตอบ (ephemeral) */
  commands?: Partial<Record<CommandId, () => Promise<string>>>;
}

export interface BotNotifier extends Notifier {
  client: Client;
  /** โพสต์แผงควบคุมพร้อมปุ่มลัดคำสั่ง */
  sendPanel(embed: Embed): Promise<void>;
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

  client.on(Events.InteractionCreate, (i) => handleInteraction(i, opts, client).catch((err) => log(`interaction พลาด: ${err instanceof Error ? err.message : err}`)));

  return {
    client,
    async send(embeds: Embed[]) {
      await target.send({ embeds, components: [buttonRow()] });
    },
    async sendPanel(embed: Embed) {
      await target.send({ embeds: [embed], components: [commandRow()] });
    },
    async close() {
      await client.destroy();
    },
  };
}

async function handleInteraction(i: Interaction, opts: BotOptions, client: Client) {
  const ephemeral = { flags: MessageFlags.Ephemeral } as const;

  if (i.isButton() && i.customId.startsWith('cmd_')) {
    const run = opts.commands?.[i.customId as CommandId];
    if (!run) { await i.reply({ content: 'ปุ่มนี้ยังไม่ได้ต่อคำสั่ง', ...ephemeral }); return; }
    await i.deferReply(ephemeral); // คำสั่งต้องโหลด PDF อาจเกิน 3 วินาที
    try {
      await i.editReply(clampReply(await run()));
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
