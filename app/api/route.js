// Prairie Star Attendance — the one server endpoint. Every request comes to
// /api?action=<something>. Actions: login, logout, students, attendance,
// extras, monthly, meta.
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query, ensureReady } from '../../lib/db';
import { checkPasscode, createSessionToken, COOKIE_NAME } from '../../lib/auth';

// ───────── date helpers (server side) ─────────
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function weekdayName(iso) {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return DAYS[new Date(y, m - 1, d).getDay()];
}
function daysInMonth(mk) {
  const [y, m] = mk.split('-').map((v) => parseInt(v, 10));
  return new Date(y, m, 0).getDate();
}

function bad(msg, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function studentToClient(row) {
  return {
    id: row.id,
    name: row.name,
    day: row.day,
    time: row.time,
    active: row.active,
    horse: row.horse,
    flag: row.flag,
  };
}

// ───────── GET ─────────
export async function GET(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  await ensureReady();

  if (action === 'students') {
    const { rows } = await query('SELECT * FROM students ORDER BY name');
    return NextResponse.json(rows.map(studentToClient));
  }

  if (action === 'meta') {
    const { rows } = await query("SELECT value FROM meta WHERE key = 'reason_presets'");
    const reasonPresets = rows[0]?.value || ['Sick', 'Lame', 'Weather', 'Emergency', 'Other'];
    return NextResponse.json({ reasonPresets });
  }

  if (action === 'attendance') {
    const date = url.searchParams.get('date');
    if (!date) return bad('date is required');
    const { rows } = await query('SELECT * FROM attendance WHERE date = $1', [date]);
    const byStudent = {};
    for (const r of rows) byStudent[r.student_id] = { status: r.status, reason: r.reason, note: r.note };
    return NextResponse.json(byStudent);
  }

  if (action === 'extras') {
    const date = url.searchParams.get('date');
    if (!date) return bad('date is required');
    const { rows } = await query('SELECT * FROM extras WHERE date = $1', [date]);
    return NextResponse.json(rows.map((r) => ({ id: r.id, studentId: r.student_id, time: r.time })));
  }

  if (action === 'monthly') {
    const month = url.searchParams.get('month'); // 'YYYY-MM'
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return bad('month must be YYYY-MM');

    const [studentsRes, extrasRes, attendanceRes] = await Promise.all([
      query('SELECT * FROM students'),
      query('SELECT * FROM extras WHERE date LIKE $1', [month + '-%']),
      query('SELECT * FROM attendance WHERE date LIKE $1', [month + '-%']),
    ]);

    const students = new Map(studentsRes.rows.map((s) => [s.id, s]));
    const extrasByDate = {};
    for (const e of extrasRes.rows) (extrasByDate[e.date] ||= []).push(e);
    const attByDate = {};
    for (const a of attendanceRes.rows) (attByDate[a.date] ||= {})[a.student_id] = a;

    const n = daysInMonth(month);
    const perStudent = {};
    const logRows = [];
    let totalPresent = 0,
      totalNoShow = 0,
      totalUnmarked = 0;
    const today = todayISO();

    for (let d = 1; d <= n; d++) {
      const iso = month + '-' + pad2(d);
      const wd = weekdayName(iso);
      const items = [];
      for (const s of students.values()) {
        if (s.active && s.day === wd) items.push({ studentId: s.id, time: s.time });
      }
      for (const e of extrasByDate[iso] || []) items.push({ studentId: e.student_id, time: e.time });
      if (items.length === 0) continue;

      for (const it of items) {
        const s = students.get(it.studentId);
        if (!s) continue;
        if (!perStudent[s.id]) {
          perStudent[s.id] = { id: s.id, name: s.name, scheduled: 0, present: 0, noshow: 0, unmarked: 0, reasons: [] };
        }
        const rec = perStudent[s.id];
        rec.scheduled++;
        const att = attByDate[iso]?.[s.id];
        let status = 'Unmarked';
        if (att?.status === 'present') {
          rec.present++;
          totalPresent++;
          status = 'Present';
        } else if (att?.status === 'no-show') {
          rec.noshow++;
          totalNoShow++;
          status = 'No-show';
          rec.reasons.push({ date: iso, reason: att.reason || '(no reason given)', note: att.note || '' });
        } else {
          rec.unmarked++;
          if (iso <= today) totalUnmarked++;
        }
        logRows.push([iso, wd, it.time || '', s.name, s.horse || '', status, att?.reason || '', att?.note || '']);
      }
    }

    const summary = Object.values(perStudent).sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({
      month,
      totals: { present: totalPresent, noshow: totalNoShow, unmarked: totalUnmarked },
      summary,
      logRows,
    });
  }

  return bad('unknown action', 404);
}

// ───────── POST ─────────
export async function POST(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const body = await req.json().catch(() => ({}));

  if (action === 'login') {
    const passcode = (body.passcode || '').trim();
    if (!process.env.APP_PASSCODE) {
      return bad('The site owner hasn’t set a passcode yet (APP_PASSCODE is missing).', 500);
    }
    if (!checkPasscode(passcode)) return bad('That passcode is not correct.', 401);
    const token = await createSessionToken();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  if (action === 'logout') {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return res;
  }

  await ensureReady();

  if (action === 'students') {
    const name = (body.name || '').trim();
    if (!body.id && !name) return bad('A name is required.');

    if (body.id) {
      // Update an existing student. Only touch fields explicitly present in the body.
      const fields = [];
      const values = [];
      let i = 1;
      for (const key of ['name', 'day', 'time', 'active', 'horse']) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          fields.push(`${key} = $${i++}`);
          values.push(body[key] === '' ? null : body[key]);
        }
      }
      if (fields.length === 0) {
        const { rows } = await query('SELECT * FROM students WHERE id = $1', [body.id]);
        return NextResponse.json(rows[0] ? studentToClient(rows[0]) : null);
      }
      values.push(body.id);
      const { rows } = await query(`UPDATE students SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
      if (!rows[0]) return bad('Student not found.', 404);
      return NextResponse.json(studentToClient(rows[0]));
    }

    const id = 's-' + crypto.randomUUID();
    const { rows } = await query(
      `INSERT INTO students (id, name, day, time, active, horse)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, name, body.day || null, body.time || null, body.active !== false, body.horse || null]
    );
    return NextResponse.json(studentToClient(rows[0]));
  }

  if (action === 'attendance') {
    const { date, studentId } = body;
    if (!date || !studentId) return bad('date and studentId are required');

    if (!body.status) {
      // Unmark: remove any record for this student/date.
      await query('DELETE FROM attendance WHERE date = $1 AND student_id = $2', [date, studentId]);
      return NextResponse.json({ ok: true, cleared: true });
    }

    const { rows } = await query(
      `INSERT INTO attendance (date, student_id, status, reason, note)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (date, student_id)
       DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, note = EXCLUDED.note
       RETURNING *`,
      [date, studentId, body.status, body.reason || null, body.note || null]
    );
    const r = rows[0];
    return NextResponse.json({ status: r.status, reason: r.reason, note: r.note });
  }

  if (action === 'extras') {
    const date = body.date;
    const time = (body.time || '').trim() || 'No time listed';
    const name = (body.name || '').trim();
    if (!date || !name) return bad('date and name are required');

    // Find an existing student by name (case-insensitive); otherwise create a
    // drop-in student record with no fixed weekly day/time.
    const existing = await query('SELECT id FROM students WHERE lower(name) = lower($1) LIMIT 1', [name]);
    let studentId = existing.rows[0]?.id;
    if (!studentId) {
      studentId = 's-' + crypto.randomUUID();
      await query('INSERT INTO students (id, name, day, time, active) VALUES ($1,$2,NULL,NULL,true)', [
        studentId,
        name,
      ]);
    }
    const extraId = 'e-' + crypto.randomUUID();
    await query('INSERT INTO extras (id, date, student_id, time) VALUES ($1,$2,$3,$4)', [
      extraId,
      date,
      studentId,
      time,
    ]);
    return NextResponse.json({ id: extraId, studentId, time });
  }

  return bad('unknown action', 404);
}
