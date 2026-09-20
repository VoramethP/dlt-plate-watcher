// connection ต่อ Supabase — สร้างต่อการเรียก ไม่มี client ระดับ module (serverless แชร์ process ข้าม request ได้)
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export function createDb(databaseUrl: string) {
  // Supabase pooler โหมด transaction (port 6543) ไม่รองรับ prepared statements
  const client = postgres(databaseUrl, { prepare: false, max: 1 });
  return { db: drizzle({ client, schema }), close: () => client.end({ timeout: 5 }) };
}

export type Db = ReturnType<typeof createDb>['db'];
