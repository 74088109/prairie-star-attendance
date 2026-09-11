import { Pool } from 'pg';

// Accept whichever connection-string env var the hosting provider sets.
// Vercel's Neon (Postgres) integration typically provides DATABASE_URL and/or
// POSTGRES_URL. Locally, set DATABASE_URL yourself (see README).
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

if (!connectionString) {
  throw new Error(
    'No database connection string found. Set DATABASE_URL (or POSTGRES_URL) in your environment.'
  );
}

// Neon (and most managed Postgres) require SSL; a local dev Postgres does not.
const needsSsl = /neon\.tech|sslmode=require|amazonaws|render\.com/.test(connectionString);

let globalPool = global.__pgPool;
if (!globalPool) {
  globalPool = new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    max: 5,
  });
  global.__pgPool = globalPool;
}

export const pool = globalPool;

export async function query(text, params) {
  return pool.query(text, params);
}

let schemaReady = global.__schemaReady || null;

async function createSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      day TEXT,
      time TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      horse TEXT,
      flag TEXT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS attendance (
      date TEXT NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      reason TEXT,
      note TEXT,
      PRIMARY KEY (date, student_id)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS extras (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      time TEXT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);
}

async function seedIfEmpty() {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM students');
  if (rows[0].n > 0) return; // already has data — never overwrite

  const seed = SEED;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const s of seed.students) {
      await client.query(
        `INSERT INTO students (id, name, day, time, active, horse, flag)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.name, s.day || null, s.time || null, s.active !== false, s.horse || null, s.flag || null]
      );
    }
    for (const [date, entries] of Object.entries(seed.extras || {})) {
      for (const e of entries) {
        await client.query(
          `INSERT INTO extras (id, date, student_id, time) VALUES ($1,$2,$3,$4)
           ON CONFLICT (id) DO NOTHING`,
          [e.id, date, e.studentId, e.time || null]
        );
      }
    }
    for (const [date, byStudent] of Object.entries(seed.attendance || {})) {
      for (const [studentId, att] of Object.entries(byStudent)) {
        if (!att || !att.status) continue;
        await client.query(
          `INSERT INTO attendance (date, student_id, status, reason, note) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (date, student_id) DO NOTHING`,
          [date, studentId, att.status, att.reason || null, att.note || null]
        );
      }
    }
    await client.query(
      `INSERT INTO meta (key, value) VALUES ('reason_presets', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(seed.reasonPresets || ['Sick', 'Lame', 'Weather', 'Emergency', 'Other'])]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Starting data, copied over from the original Claude Artifact version. Used
// ONCE, only when the database is completely empty; never read again after.
const SEED = {"meta":{"idCounter":2009,"showImportNotice":true},"reasonPresets":["Sick","Lame","Weather","Emergency","Other"],"students":[{"id":"s2","name":"Billy","day":"Monday","time":"3:30 PM","active":true},{"id":"s3","name":"Kaylee","day":"Monday","time":"4:30 PM","active":true},{"id":"s5","name":"Maddie","day":"Monday","time":"4:30 PM","active":true},{"id":"s6","name":"Drew","day":"Monday","time":"4:30 PM","active":true,"horse":"Ava"},{"id":"s4","name":"Glynnis","day":"Monday","time":"4:30 PM","active":true},{"id":"s8","name":"Riley","day":"Monday","time":"5:30 PM","active":true,"horse":"Horst"},{"id":"s7","name":"Adley","day":"Monday","time":"5:30 PM","active":true,"horse":"Special"},{"id":"s9","name":"Grayson","day":"Monday","time":"6:30 PM","active":true,"horse":"Dixi"},{"id":"s10","name":"Blakely","day":"Monday","time":"6:30 PM","active":true,"horse":"Snip"},{"id":"s11","name":"Alyssa","day":"Monday","time":"6:30 PM","active":true,"horse":"Dixie"},{"id":"s12","name":"Monroe","day":"Monday","time":"6:30 PM","active":true,"horse":"Rogan"},{"id":"s15","name":"Julie","day":"Monday","time":"7:30 PM","active":true},{"id":"s14","name":"Gemma","day":"Monday","time":"7:30 PM","active":true},{"id":"s13","name":"Tasia","day":"Monday","time":"7:30 PM","active":true,"horse":"Zen"},{"id":"s16","name":"Hailey","day":"Monday","time":"7:30 PM","active":true},{"id":"s17","name":"Brett / Dustin & Mathios","day":"Tuesday","time":"1:30 PM","active":true,"flag":"Still unclear in your notes whether this is one lesson for Brett, or a lesson for Dustin and Mathios together. Please confirm who this slot is for."},{"id":"s18","name":"Shannon","day":"Tuesday","time":"2:30 PM","active":true},{"id":"s2002","name":"Jane","day":"Tuesday","time":"3:30 PM","active":true,"flag":"Spelled \"Jane\" in the new schedule — please confirm whether this is the same person as \"Jayne\" (Thursday 5:00) or a different student, and I'll merge or correct the spelling.","horse":"Dixi"},{"id":"s19","name":"Kirsten","day":"Tuesday","time":"4:30 PM","active":true},{"id":"s21","name":"Ruby","day":"Tuesday","time":"5:30 PM","active":true,"horse":"Jay"},{"id":"s22","name":"Costa","day":"Tuesday","time":"5:30 PM","active":true,"horse":"Dixie"},{"id":"s24","name":"Arie","day":"Tuesday","time":"5:30 PM","active":true},{"id":"s25","name":"Brielle","day":"Tuesday","time":"6:30 PM","active":true,"horse":"Special"},{"id":"s26","name":"Liv","day":"Tuesday","time":"6:30 PM","active":true,"horse":"Rogan"},{"id":"s27","name":"Taban","day":"Tuesday","time":"6:30 PM","active":true,"horse":"Cady"},{"id":"s28","name":"Gracie","day":"Tuesday","time":"6:30 PM","active":true,"horse":"Niles"},{"id":"s29","name":"Reese","day":"Tuesday","time":"7:30 PM","active":true},{"id":"s30","name":"Layne","day":"Tuesday","time":"7:30 PM","active":true},{"id":"s20","name":"Glynnis","day":"Tuesday","time":"7:30 PM","active":true},{"id":"s32","name":"Gayle","day":"Wednesday","time":"3:30 PM","active":true},{"id":"s33","name":"Kaylee","day":"Wednesday","time":"4:30 PM","active":true},{"id":"s34","name":"Glynnis","day":"Wednesday","time":"4:30 PM","active":true},{"id":"s2003","name":"Drew","day":"Wednesday","time":"4:30 PM","active":true,"horse":"Ava"},{"id":"s50","name":"Ali","day":"Wednesday","time":"5:30 PM","active":true,"horse":"Rogan"},{"id":"s51","name":"Olivia","day":"Wednesday","time":"5:30 PM","active":true,"horse":"Horst"},{"id":"s2004","name":"Alexia","day":"Wednesday","time":"5:30 PM","active":true,"horse":"Cady"},{"id":"s38","name":"Kenzie","day":"Wednesday","time":"6:30 PM","active":true,"horse":"Snip"},{"id":"s39","name":"Maggie","day":"Wednesday","time":"6:30 PM","active":true,"horse":"Dixie"},{"id":"s52","name":"Ava","day":"Wednesday","time":"6:30 PM","active":true,"horse":"Dixie"},{"id":"s2005","name":"Lily","day":"Wednesday","time":"6:30 PM","active":true},{"id":"s2006","name":"Trena","day":"Thursday","time":"2:30 PM","active":true},{"id":"s43","name":"Jayne","day":"Thursday","time":"5:00 PM","active":true},{"id":"s44","name":"Glynnis","day":"Thursday","time":"6:00 PM","active":true},{"id":"s45","name":"Reese","day":"Thursday","time":"6:00 PM","active":true},{"id":"s46","name":"Layne","day":"Thursday","time":"6:00 PM","active":true},{"id":"s2007","name":"Liba","day":"Friday","time":"10:00 AM","active":true},{"id":"s2008","name":"Adrienne","day":"Friday","time":"11:00 AM","active":true},{"id":"s54","name":"Michelle","day":"Friday","time":"5:00 PM","active":true},{"id":"s53","name":"Liz","day":"Friday","time":"5:00 PM","active":true},{"id":"s47","name":"Arie","day":"Friday","time":"6:00 PM","active":true},{"id":"s48","name":"Glynnis","day":"Friday","time":"6:00 PM","active":true},{"id":"s49","name":"Gemma","day":"Friday","time":"6:00 PM","active":true},{"id":"s55","name":"Rowen","day":"Saturday","time":"10:00 AM","active":true,"horse":"Horst"},{"id":"s57","name":"Irene","day":"Saturday","time":"10:00 AM","active":true,"horse":"Specials"},{"id":"s56","name":"Avery","day":"Saturday","time":"10:00 AM","active":true,"horse":"Dixie"},{"id":"s58","name":"Harlow","day":"Saturday","time":"10:00 AM","active":true,"horse":"Rogan"},{"id":"s62","name":"Tasia","day":"Saturday","time":"11:00 AM","active":true},{"id":"s65","name":"Julie","day":"Saturday","time":"11:00 AM","active":true},{"id":"s63","name":"Reese","day":"Saturday","time":"11:00 AM","active":true},{"id":"s64","name":"Layne","day":"Saturday","time":"11:00 AM","active":true},{"id":"s59","name":"Shannon","day":"Saturday","time":"12:30 PM","active":true},{"id":"s60","name":"Roberta","day":"Saturday","time":"12:30 PM","active":true},{"id":"s61","name":"Shayla","day":"Saturday","time":"12:30 PM","active":true},{"id":"s66","name":"Costa","day":"Saturday","time":"1:30 PM","active":true,"horse":"Dixie"},{"id":"s67","name":"Ruby","day":"Saturday","time":"1:30 PM","active":true,"horse":"Jay"},{"id":"s23","name":"Islan","day":"Saturday","time":"1:30 PM","active":true,"horse":"Ava"},{"id":"s2009","name":"Taban","day":"Saturday","time":"2:30 PM","active":true},{"id":"s1","name":"Brigitte","day":"Monday","time":"9:00 AM","active":false,"flag":"Not on the new schedule you provided on 2026-09-09 — set to inactive. Restore in Roster if this was left off by mistake."},{"id":"s31","name":"Sadie","day":"Tuesday","time":"7:30 PM","active":false,"flag":"Not on the new schedule you provided on 2026-09-09 — set to inactive. Restore in Roster if this was left off by mistake."},{"id":"s35","name":"Beckett","day":"Wednesday","time":"5:30 PM","active":false,"flag":"Not on the new schedule you provided on 2026-09-09 — set to inactive. Restore in Roster if this was left off by mistake."},{"id":"s36","name":"Presley","day":"Wednesday","time":"5:30 PM","active":false,"flag":"Not on the new schedule you provided on 2026-09-09 — set to inactive. Restore in Roster if this was left off by mistake."},{"id":"s37","name":"Baylor","day":"Wednesday","time":"5:30 PM","active":false,"flag":"Not on the new schedule you provided on 2026-09-09 — set to inactive. Restore in Roster if this was left off by mistake."},{"id":"s40","name":"Suzy","day":"Wednesday","time":"6:30 PM","active":false,"flag":"Not on the new schedule you provided on 2026-09-09 — set to inactive. Restore in Roster if this was left off by mistake."},{"id":"s41","name":"Athena","day":"Wednesday","time":"6:30 PM","active":false,"flag":"Not on the new schedule you provided on 2026-09-09 — set to inactive. Restore in Roster if this was left off by mistake."},{"id":"s42","name":"Wendy","day":"Thursday","time":"TBD (starting Oct)","active":false,"flag":"Not on the new schedule you provided on 2026-09-09 — set to inactive. Restore in Roster if this was left off by mistake."},{"id":"s68","name":"Islan","day":"Saturday","time":"1:00 PM","active":false,"flag":"Not on the new schedule you provided on 2026-09-09 — set to inactive. Restore in Roster if this was left off by mistake."}],"extras":{"2026-08-31":[{"id":"e2001","studentId":"s5","time":"5:00 pm"}]},"attendance":{"2026-08-31":{"s2":{"status":"present","reason":null,"note":null},"s3":{"status":"present","reason":null,"note":null},"s6":{"status":"no-show"},"s8":{"status":"present","reason":null,"note":null}},"2026-08-29":{"s55":{"status":"present","reason":null,"note":null},"s56":{"status":"no-show","reason":"Family emergency"},"s61":{"status":"present","reason":null,"note":null},"s62":{"status":"present","reason":null,"note":null}}}};

export async function ensureReady() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await createSchema();
      await seedIfEmpty();
    })();
    global.__schemaReady = schemaReady;
  }
  return schemaReady;
}
