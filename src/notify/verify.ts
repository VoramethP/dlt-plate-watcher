// ตรวจลายเซ็น Ed25519 ของ Discord ทุก request ที่เข้า Interactions Endpoint — ไม่ตรวจ = ใครก็ยิงปุ่มปลอมมาได้
// ใช้ node:crypto ตรง ๆ (Node 22 มี Ed25519) ไม่ต้องเพิ่ม dependency
import { createPublicKey, verify } from 'node:crypto';

/** DER prefix ของ SubjectPublicKeyInfo สำหรับ Ed25519 — Discord ให้ public key มาเป็น raw 32 ไบต์ (hex) */
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function verifyDiscordSignature(publicKeyHex: string, signatureHex: string | null, timestamp: string | null, body: string): boolean {
  if (!signatureHex || !timestamp) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false; // key/ลายเซ็นรูปแบบผิด = ไม่ผ่าน ไม่ใช่ล้ม
  }
}
