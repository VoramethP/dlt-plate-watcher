// Interactions Endpoint URL ของ Discord — POST เท่านั้น · ตรวจลายเซ็นก่อนทำอะไร (ADR-0005)
import { waitUntil } from '@vercel/functions';
import { createApp } from '../src/app.js';
import { handleInteraction, type Interaction } from '../src/notify/interactions.js';
import { verifyDiscordSignature } from '../src/notify/verify.js';

export async function POST(req: Request): Promise<Response> {
  const body = await req.text();
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return new Response('DISCORD_PUBLIC_KEY ยังไม่ได้ตั้ง', { status: 500 });
  if (!verifyDiscordSignature(publicKey, req.headers.get('x-signature-ed25519'), req.headers.get('x-signature-timestamp'), body)) {
    return new Response('invalid request signature', { status: 401 });
  }
  const interaction = JSON.parse(body) as Interaction;
  const app = await createApp();
  const { response, work } = await handleInteraction(interaction, app);
  // ตอบภายใน 3 วิ แล้วให้งานที่เหลือ (โหลด PDF ฯลฯ) ทำต่อหลัง response ออกไปแล้ว
  waitUntil((work ? work() : Promise.resolve()).finally(() => app.close()));
  return Response.json(response);
}
