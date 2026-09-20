import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyDiscordSignature } from '../src/notify/verify.js';

// จำลอง Discord: public key เป็น raw 32 ไบต์ hex (ตัด SPKI prefix 12 ไบต์ออก) ลายเซ็นบน timestamp + body
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const rawHex = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(12).toString('hex');
const signHex = (timestamp: string, body: string) => sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');

describe('ตรวจลายเซ็น Ed25519 ของ Discord', () => {
  const body = JSON.stringify({ type: 1 });
  it('ลายเซ็นถูก → ผ่าน', () => {
    expect(verifyDiscordSignature(rawHex, signHex('1700000000', body), '1700000000', body)).toBe(true);
  });
  it('body/timestamp ถูกแก้ หรือ header หาย → ไม่ผ่าน (ไม่โยน error)', () => {
    const sig = signHex('1700000000', body);
    expect(verifyDiscordSignature(rawHex, sig, '1700000001', body)).toBe(false);
    expect(verifyDiscordSignature(rawHex, sig, '1700000000', body + ' ')).toBe(false);
    expect(verifyDiscordSignature(rawHex, null, '1700000000', body)).toBe(false);
    expect(verifyDiscordSignature(rawHex, sig, null, body)).toBe(false);
    expect(verifyDiscordSignature('zz', sig, '1700000000', body)).toBe(false);
    expect(verifyDiscordSignature(rawHex, 'abcd', '1700000000', body)).toBe(false);
  });
});
