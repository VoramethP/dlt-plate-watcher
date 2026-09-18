// กันความลับหลุดเข้า repo public: ไฟล์ *.example ต้องมีแค่ placeholder
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const REAL_WEBHOOK = /discord(app)?\.com\/api\/webhooks\/\d{10,}\/[\w-]{20,}/;
const REAL_BOT_TOKEN = /[\w-]{23,}\.[\w-]{6}\.[\w-]{27,}/;

describe('ไฟล์ตัวอย่างต้องไม่มีความลับจริง', () => {
  it('.env.example มีแค่ placeholder', async () => {
    const text = await readFile('.env.example', 'utf8');
    expect(text).not.toMatch(REAL_WEBHOOK);
    expect(text).not.toMatch(REAL_BOT_TOKEN);
    expect(text).toMatch(/^DISCORD_BOT_TOKEN=$/m);
    expect(text).toContain('xxxxxxxx/yyyyyyyy');
  });
  it('watch.config.example.json parse ได้และไม่มี webhook', async () => {
    const text = await readFile('watch.config.example.json', 'utf8');
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).not.toMatch(REAL_WEBHOOK);
  });
});
