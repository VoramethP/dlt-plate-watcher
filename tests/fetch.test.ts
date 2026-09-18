import { describe, expect, it } from 'vitest';
import { isPdf, normalizeDriveFileId } from '../src/schedule/fetch.js';

describe('normalizeDriveFileId', () => {
  const ID = '1UP-epw_Yxn3j8OrWsj10oKKxind5rktI';
  it('รับ id เปล่า', () => expect(normalizeDriveFileId(ID)).toBe(ID));
  it('รับลิงก์ preview / view / open / uc', () => {
    expect(normalizeDriveFileId(`https://drive.google.com/file/d/${ID}/preview`)).toBe(ID);
    expect(normalizeDriveFileId(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toBe(ID);
    expect(normalizeDriveFileId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(normalizeDriveFileId(`https://drive.google.com/uc?export=download&id=${ID}`)).toBe(ID);
  });
  it('รับ HTML ที่ copy มาทั้งก้อน และข้าม iframe เก่าที่ถูกคอมเมนต์ทิ้ง', () => {
    const html = `
      <!--<iframe src="https://drive.google.com/file/d/OLD_ID_1234567890abcdef/preview"></iframe>-->
      <iframe src="https://drive.google.com/file/d/${ID}/preview" width="100%"></iframe>`;
    expect(normalizeDriveFileId(html)).toBe(ID);
  });
  it('คืน null เมื่อไม่ใช่', () => {
    expect(normalizeDriveFileId('hello')).toBeNull();
    expect(normalizeDriveFileId('https://example.com/x.pdf')).toBeNull();
  });
});

describe('isPdf', () => {
  it('เช็ค magic bytes', () => {
    expect(isPdf(new TextEncoder().encode('%PDF-1.7 ...'))).toBe(true);
    expect(isPdf(new TextEncoder().encode('<html>'))).toBe(false);
  });
});
