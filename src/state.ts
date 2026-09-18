// จำว่าเคยแจ้งอะไรไปแล้ว จะได้ไม่สแปม Discord ทุกครั้งที่ cron รัน
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface State {
  /** key ของสิ่งที่แจ้งไปแล้ว เช่น "match:2026-09-14:8ขจ:8001-9999" */
  notified: string[];
  /** เวอร์ชันตารางล่าสุดที่เห็น (Last-Modified บน Drive) — เปลี่ยนแปลว่าขนส่งออกตารางใหม่ */
  lastScheduleVersion?: string;
}

const EMPTY: State = { notified: [] };

export async function loadState(path: string): Promise<State> {
  try {
    return { ...EMPTY, ...JSON.parse(await readFile(path, 'utf8')) } as State;
  } catch {
    return { ...EMPTY };
  }
}

export async function saveState(path: string, state: State): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  // เก็บแค่ 500 รายการล่าสุดพอ — key ผูกกับวันที่ ของเก่าไม่มีทางซ้ำอีก
  const trimmed = { ...state, notified: state.notified.slice(-500) };
  await writeFile(path, JSON.stringify(trimmed, null, 2) + '\n');
}
