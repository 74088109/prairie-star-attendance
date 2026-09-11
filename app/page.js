'use client';
// Prairie Star Attendance — the whole app UI lives in this one file so it is
// easy to put on GitHub. Sections: date helpers, toasts, icons, the three
// tabs (Today / Roster / Monthly), and the app shell at the bottom.
import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';


// ───────────────────────── Date helpers ─────────────────────────
// Pure date helpers shared between server (API routes) and client components.
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function isoToDate(iso) {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}
function addDaysISO(iso, n) {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function weekdayName(iso) {
  return DAYS[isoToDate(iso).getDay()];
}
function formatLong(iso) {
  const d = isoToDate(iso);
  return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}
function monthKeyOf(iso) {
  return iso.slice(0, 7);
}
function monthLabel(mk) {
  const [y, m] = mk.split('-');
  return MONTHS[parseInt(m, 10) - 1] + ' ' + y;
}
function shiftMonth(mk, n) {
  let [y, m] = mk.split('-').map((v) => parseInt(v, 10));
  m -= 1;
  m += n;
  while (m < 0) {
    m += 12;
    y--;
  }
  while (m > 11) {
    m -= 12;
    y++;
  }
  return y + '-' + pad2(m + 1);
}
function daysInMonth(mk) {
  const [y, m] = mk.split('-').map((v) => parseInt(v, 10));
  return new Date(y, m, 0).getDate();
}
function parseMinutes(t) {
  if (!t) return 9999;
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(t.trim());
  if (!m) return 9999;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + parseInt(m[2], 10);
}

// ───────────────────────── Toasts ─────────────────────────
const ToastCtx = createContext(() => {});

function useToast() {
  return useContext(ToastCtx);
}

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, show: false }]);
    requestAnimationFrame(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, show: true } : x)));
    });
    setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, show: false } : x)));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 250);
    }, 2600);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div id="toast-root">
        {toasts.map((t) => (
          <div key={t.id} className={'toast' + (t.show ? ' show' : '')}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ───────────────────────── Icons ─────────────────────────
const TodayIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2"></rect>
    <path d="M3 10h18"></path>
    <path d="M8 3v4M16 3v4"></path>
    <path d="m9 15 2 2 4-4"></path>
  </svg>
);
const RosterIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6h13M8 12h13M8 18h13"></path>
    <path d="M3 6h.01M3 12h.01M3 18h.01"></path>
  </svg>
);
const MonthlyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20V10M12 20V4M20 20v-7"></path>
  </svg>
);

// ───────────────────────── Today tab ─────────────────────────
function esc(s) {
  return s == null ? '' : String(s);
}

function TodayTab({ students, reasonPresets, refreshStudents }) {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [attendance, setAttendance] = useState({});
  const [extras, setExtras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addTime, setAddTime] = useState('');

  const load = useCallback(async (iso) => {
    setLoading(true);
    try {
      const [attRes, exRes] = await Promise.all([
        fetch('/api?action=attendance&date=' + iso).then((r) => r.json()),
        fetch('/api?action=extras&date=' + iso).then((r) => r.json()),
      ]);
      setAttendance(attRes || {});
      setExtras(Array.isArray(exRes) ? exRes : []);
    } catch {
      toast('Could not load this day — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load(selectedDate);
  }, [selectedDate, load]);

  const wd = weekdayName(selectedDate);
  const studentById = new Map(students.map((s) => [s.id, s]));

  const items = [];
  for (const s of students) {
    if (s.active && s.day === wd) items.push({ studentId: s.id, time: s.time, source: 'recurring' });
  }
  for (const e of extras) {
    items.push({ studentId: e.studentId, time: e.time, source: 'extra' });
  }
  items.sort((a, b) => parseMinutes(a.time) - parseMinutes(b.time));

  const bySlot = {};
  for (const it of items) {
    const key = it.time || 'No time listed';
    (bySlot[key] ||= []).push(it);
  }
  const slotKeys = Object.keys(bySlot).sort((a, b) => parseMinutes(a) - parseMinutes(b));

  async function saveAttendance(studentId, next) {
    const prev = attendance[studentId];
    setAttendance((a) => ({ ...a, [studentId]: next.status ? next : undefined }));
    try {
      const res = await fetch('/api?action=attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, studentId, ...next }),
      });
      if (!res.ok) throw new Error('bad status');
    } catch {
      setAttendance((a) => ({ ...a, [studentId]: prev }));
      toast('Could not save that — try again.');
    }
  }

  function setPresent(studentId) {
    saveAttendance(studentId, { status: 'present', reason: null, note: null });
  }
  function setNoShow(studentId) {
    const cur = attendance[studentId] || {};
    saveAttendance(studentId, { status: 'no-show', reason: cur.reason || null, note: cur.note || null });
  }
  function clearStatus(studentId) {
    saveAttendance(studentId, { status: null, reason: null, note: null });
  }
  function setReason(studentId, reason) {
    const cur = attendance[studentId] || {};
    saveAttendance(studentId, { status: 'no-show', reason, note: cur.note || null });
  }
  function setNote(studentId, note) {
    const cur = attendance[studentId] || {};
    saveAttendance(studentId, { status: cur.status || 'no-show', reason: cur.reason || null, note });
  }

  async function confirmAdd() {
    const name = addName.trim();
    if (!name) {
      toast('Enter a student name first.');
      return;
    }
    const time = addTime.trim() || 'No time listed';
    try {
      const res = await fetch('/api?action=extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, name, time }),
      });
      if (!res.ok) throw new Error('bad');
      const created = await res.json();
      setExtras((ex) => [...ex, created]);
      setAddOpen(false);
      setAddName('');
      setAddTime('');
      refreshStudents();
    } catch {
      toast('Could not add that lesson — try again.');
    }
  }

  return (
    <div>
      <div className="datebar">
        <button className="stepbtn" onClick={() => setSelectedDate(addDaysISO(selectedDate, -1))}>
          &#8249;
        </button>
        <div className="datelabel">
          <div className="weekday">{wd}</div>
          <div className="full">{formatLong(selectedDate)}</div>
        </div>
        <input
          type="date"
          className="datepick"
          value={selectedDate}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
        />
        {selectedDate !== todayISO() ? (
          <button className="todaybtn" onClick={() => setSelectedDate(todayISO())}>
            Today
          </button>
        ) : null}
        <button className="stepbtn" onClick={() => setSelectedDate(addDaysISO(selectedDate, 1))}>
          &#8250;
        </button>
      </div>

      {loading ? (
        <div className="card">
          <div className="empty">Loading…</div>
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="big">No lessons scheduled</div>
            No recurring lessons fall on {wd}. Add an ad hoc lesson below if you&rsquo;re fitting someone in today.
          </div>
        </div>
      ) : (
        slotKeys.map((slot) => (
          <div className="card" key={slot}>
            <div className="slot-head">{slot}</div>
            {bySlot[slot].map((it) => {
              const s = studentById.get(it.studentId);
              if (!s) return null;
              const att = attendance[it.studentId] || {};
              const status = att.status || '';
              return (
                <div className="row" key={it.studentId + slot}>
                  <div className="row-top">
                    <div className="row-name">
                      {s.name}
                      {s.horse ? <span className="horse-tag">🐴 {s.horse}</span> : null}
                      {it.source === 'extra' ? <span className="badge extra">Ad hoc</span> : null}
                      {s.flag ? (
                        <span className="badge flag" title={s.flag}>
                          ⚠ review
                        </span>
                      ) : null}
                    </div>
                    <div className="seg">
                      <button
                        className={'present' + (status === 'present' ? ' on' : '')}
                        onClick={() => setPresent(it.studentId)}
                      >
                        Present
                      </button>
                      <button
                        className={'noshow' + (status === 'no-show' ? ' on' : '')}
                        onClick={() => setNoShow(it.studentId)}
                      >
                        No-show
                      </button>
                    </div>
                  </div>
                  {status ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="clearbtn" onClick={() => clearStatus(it.studentId)}>
                        Unmark
                      </button>
                    </div>
                  ) : null}
                  {status === 'no-show' ? (
                    <>
                      <div className="reasons">
                        {reasonPresets.map((r) => (
                          <button
                            key={r}
                            className={'chip' + (att.reason === r ? ' on' : '')}
                            onClick={() => setReason(it.studentId, r)}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        className="noteinput"
                        placeholder="Add a note (optional)"
                        defaultValue={esc(att.note)}
                        onBlur={(e) => setNote(it.studentId, e.target.value)}
                      />
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))
      )}

      <div className="addbar">
        {!addOpen ? (
          <button className="addbtn" onClick={() => setAddOpen(true)}>
            + Add ad hoc lesson for this day
          </button>
        ) : (
          <div className="addform">
            <div className="field">
              <label>Student</label>
              <input
                type="text"
                list="studentnames"
                placeholder="Type a name…"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                autoFocus
              />
              <datalist id="studentnames">
                {students.map((s) => (
                  <option value={s.name} key={s.id} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label>Time</label>
              <input
                type="text"
                placeholder="e.g. 5:00 PM"
                value={addTime}
                onChange={(e) => setAddTime(e.target.value)}
              />
            </div>
            <div className="btnrow">
              <button className="btn ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={confirmAdd}>
                Add lesson
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Roster tab ─────────────────────────
function RosterTab({ students, mutateStudent, addStudent }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDay, setNewDay] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newHorse, setNewHorse] = useState('');

  const query = q.trim().toLowerCase();
  const groups = DAYS.slice(1).concat([DAYS[0]]);
  const noDay = students.filter((s) => !s.day);

  function StudentRow({ s }) {
    return (
      <div className={'studentrow' + (s.active ? '' : ' inactive')}>
        <div className="srow-top">
          <input
            type="text"
            defaultValue={s.name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== s.name) mutateStudent(s.id, { name: v });
            }}
          />
          <input
            type="text"
            className="timein"
            placeholder="Time"
            defaultValue={s.time || ''}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (s.time || '')) mutateStudent(s.id, { time: v });
            }}
          />
        </div>
        <div className="srow-horse">
          <span className="horse-label">🐴 Horse</span>
          <input
            type="text"
            className="horsein"
            placeholder="e.g. Dixie"
            defaultValue={s.horse || ''}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (s.horse || '')) mutateStudent(s.id, { horse: v || null });
            }}
          />
        </div>
        {s.flag ? <div className="flagnote">⚠ {s.flag}</div> : null}
        <div className="srow-bottom">
          <select
            className="dayselect"
            defaultValue={s.day || ''}
            onChange={(e) => mutateStudent(s.id, { day: e.target.value || null })}
          >
            <option value="">Drop-in only</option>
            {DAYS.map((d) => (
              <option value={d} key={d}>
                {d}
              </option>
            ))}
          </select>
          <button className="smallbtn" onClick={() => mutateStudent(s.id, { active: !s.active })}>
            {s.active ? 'Remove from schedule' : 'Restore'}
          </button>
        </div>
      </div>
    );
  }

  let any = false;
  const sections = [];
  for (const day of groups) {
    let list = students.filter((s) => s.day === day);
    if (query) list = list.filter((s) => s.name.toLowerCase().includes(query));
    if (list.length === 0) continue;
    any = true;
    sections.push(
      <div className="daygroup" key={day}>
        <h2>{day}</h2>
        {list.map((s) => (
          <StudentRow s={s} key={s.id} />
        ))}
      </div>
    );
  }
  let dropins = noDay;
  if (query) dropins = dropins.filter((s) => s.name.toLowerCase().includes(query));
  if (dropins.length) {
    any = true;
    sections.push(
      <div className="daygroup" key="dropins">
        <h2>Drop-in / ad hoc only</h2>
        {dropins.map((s) => (
          <StudentRow s={s} key={s.id} />
        ))}
      </div>
    );
  }

  async function confirmAddStudent() {
    const name = newName.trim();
    if (!name) {
      toast('Enter a name first.');
      return;
    }
    try {
      await addStudent({
        name,
        day: newDay || null,
        time: newTime.trim() || null,
        horse: newHorse.trim() || null,
      });
      setAddOpen(false);
      setNewName('');
      setNewDay('');
      setNewTime('');
      setNewHorse('');
    } catch {
      toast('Could not add that student — try again.');
    }
  }

  return (
    <div>
      <input
        type="text"
        className="searchbox"
        placeholder="Search students…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {!any ? (
        <div className="card">
          <div className="empty">No students match &quot;{q}&quot;.</div>
        </div>
      ) : (
        sections
      )}

      <div className="addbar">
        {!addOpen ? (
          <button className="addbtn" onClick={() => setAddOpen(true)}>
            + Add student
          </button>
        ) : (
          <div className="addform">
            <div className="field">
              <label>Name</label>
              <input
                type="text"
                placeholder="Student name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="formrow">
              <div className="field">
                <label>Day</label>
                <select value={newDay} onChange={(e) => setNewDay(e.target.value)}>
                  <option value="">Drop-in only</option>
                  {DAYS.map((d) => (
                    <option value={d} key={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Time</label>
                <input
                  type="text"
                  placeholder="e.g. 4:30 PM"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>Horse (optional)</label>
              <input
                type="text"
                placeholder="e.g. Dixie"
                value={newHorse}
                onChange={(e) => setNewHorse(e.target.value)}
              />
            </div>
            <div className="btnrow">
              <button className="btn ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={confirmAddStudent}>
                Add student
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Monthly tab ─────────────────────────
function MonthlyTab() {
  const toast = useToast();
  const [mk, setMk] = useState(monthKeyOf(todayISO()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (month) => {
    setLoading(true);
    try {
      const res = await fetch('/api?action=monthly&month=' + month);
      const json = await res.json();
      setData(json);
    } catch {
      toast('Could not load this month — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load(mk);
  }, [mk, load]);

  async function exportMonth() {
    if (!data) return;
    const XLSX = await import('xlsx');
    const summaryRows = [['Student', 'Scheduled', 'Present', 'No-show', 'Unmarked']];
    for (const r of data.summary) {
      summaryRows.push([r.name, r.scheduled, r.present, r.noshow, r.unmarked]);
    }
    const logRows = [['Date', 'Day', 'Time', 'Student', 'Horse', 'Status', 'Reason', 'Note'], ...data.logRows];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Monthly Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(logRows), 'Daily Log');
    XLSX.writeFile(wb, `prairie-star-attendance-${mk}.xlsx`);
    toast('Downloaded prairie-star-attendance-' + mk + '.xlsx');
  }

  const withReasons = data ? data.summary.filter((r) => r.reasons.length) : [];
  const flat = [];
  withReasons.forEach((r) => r.reasons.forEach((x) => flat.push({ name: r.name, ...x })));
  flat.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <div className="monthbar">
        <button className="stepbtn" onClick={() => setMk(shiftMonth(mk, -1))}>
          &#8249;
        </button>
        <div className="monthlabel">{monthLabel(mk)}</div>
        <button className="stepbtn" onClick={() => setMk(shiftMonth(mk, 1))}>
          &#8250;
        </button>
      </div>

      {loading || !data ? (
        <div className="card">
          <div className="empty">Loading…</div>
        </div>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <div className="n num" style={{ color: 'var(--good)' }}>
                {data.totals.present}
              </div>
              <div className="l">Present</div>
            </div>
            <div className="stat">
              <div className="n num" style={{ color: 'var(--bad)' }}>
                {data.totals.noshow}
              </div>
              <div className="l">No-shows</div>
            </div>
            <div className="stat">
              <div className="n num">{data.totals.unmarked}</div>
              <div className="l">Unmarked</div>
            </div>
          </div>

          {data.summary.length === 0 ? (
            <div className="card">
              <div className="empty">
                <div className="big">Nothing scheduled yet</div>No lessons fall in {monthLabel(mk)} yet.
              </div>
            </div>
          ) : (
            <>
              <div className="tablewrap">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Sched.</th>
                      <th>Present</th>
                      <th>No-show</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.summary.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td className="num">{r.scheduled}</td>
                        <td className="num" style={{ color: 'var(--good)' }}>
                          {r.present}
                        </td>
                        <td className="num" style={{ color: 'var(--bad)' }}>
                          {r.noshow}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {flat.length ? (
                <details className="log">
                  <summary>No-show reasons this month</summary>
                  <div className="tablewrap" style={{ marginTop: 8 }}>
                    <table className="ledger">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Student</th>
                          <th>Reason</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flat.map((x, i) => (
                          <tr key={i}>
                            <td className="num">{x.date}</td>
                            <td>{x.name}</td>
                            <td className="noshowreason">{x.reason}</td>
                            <td>{x.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
            </>
          )}

          <button className="exportbtn" onClick={exportMonth}>
            Export {monthLabel(mk)} to Excel
          </button>
        </>
      )}
    </div>
  );
}

// ───────────────────────── App shell ─────────────────────────
function AppInner() {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState('today');
  const [students, setStudents] = useState([]);
  const [reasonPresets, setReasonPresets] = useState(['Sick', 'Lame', 'Weather', 'Emergency', 'Other']);
  const [ready, setReady] = useState(false);

  const refreshStudents = useCallback(async () => {
    try {
      const res = await fetch('/api?action=students');
      const json = await res.json();
      setStudents(Array.isArray(json) ? json : []);
    } catch {
      toast('Could not load the roster — check your connection.');
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      await Promise.all([
        refreshStudents(),
        fetch('/api?action=meta')
          .then((r) => r.json())
          .then((j) => j.reasonPresets && setReasonPresets(j.reasonPresets))
          .catch(() => {}),
      ]);
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mutateStudent(id, patch) {
    const prev = students;
    setStudents((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    try {
      const res = await fetch('/api?action=students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error('bad');
    } catch {
      setStudents(prev);
      toast('Could not save that change — try again.');
    }
  }

  async function addStudent(fields) {
    const res = await fetch('/api?action=students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error('bad');
    const created = await res.json();
    setStudents((list) => [...list, created]);
    return created;
  }

  async function logout() {
    await fetch('/api?action=logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <h1>
            Prairie Star <span className="dim">Attendance</span>
          </h1>
          <button className="logoutbtn" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main>
        {!ready ? (
          <div className="card">
            <div className="empty">Loading…</div>
          </div>
        ) : tab === 'today' ? (
          <TodayTab students={students} reasonPresets={reasonPresets} refreshStudents={refreshStudents} />
        ) : tab === 'roster' ? (
          <RosterTab students={students} mutateStudent={mutateStudent} addStudent={addStudent} />
        ) : (
          <MonthlyTab />
        )}
      </main>
      <nav className="tabbar">
        <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>
          <TodayIcon />
          <span>Today</span>
        </button>
        <button className={tab === 'roster' ? 'active' : ''} onClick={() => setTab('roster')}>
          <RosterIcon />
          <span>Roster</span>
        </button>
        <button className={tab === 'monthly' ? 'active' : ''} onClick={() => setTab('monthly')}>
          <MonthlyIcon />
          <span>Monthly</span>
        </button>
      </nav>
    </>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
