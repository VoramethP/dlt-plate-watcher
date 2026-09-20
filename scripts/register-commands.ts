// ลงทะเบียน /panel ครั้งเดียว — serverless ไม่มีตอน "เริ่ม" ให้ลงทะเบียนเหมือน gateway (ADR-0005)
// มี DISCORD_GUILD_ID → guild command (มีผลทันที) · ไม่มี → global (ใช้เวลาถึง 1 ชม.)
import { PANEL_COMMAND } from '../src/notify/interactions.js';
import { discordRest } from '../src/notify/rest.js';

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APP_ID;
const guildId = process.env.DISCORD_GUILD_ID;
if (!token || !appId) { console.error('ต้องตั้ง DISCORD_BOT_TOKEN และ DISCORD_APP_ID ใน .env — ดู .env.example'); process.exit(1); }

const rest = discordRest(token);
const path = guildId ? `/applications/${appId}/guilds/${guildId}/commands` : `/applications/${appId}/commands`;
await rest.request('PUT', path, [PANEL_COMMAND]);
console.log(`ลงทะเบียน /${PANEL_COMMAND.name} แล้ว (${guildId ? `guild ${guildId} มีผลทันที` : 'global อาจรอถึง 1 ชม.'})`);
