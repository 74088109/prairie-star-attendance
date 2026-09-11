'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not log in.');
        setBusy(false);
        return;
      }
      const next = params.get('next') || '/';
      router.push(next);
      router.refresh();
    } catch {
      setError('Something went wrong — check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <form style={styles.card} onSubmit={submit}>
        <h1 style={styles.h1}>🐴 Prairie Star</h1>
        <p style={styles.p}>Enter the shared passcode to open the attendance tracker.</p>
        <input
          type="password"
          autoFocus
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          style={styles.input}
        />
        {error ? <div style={styles.error}>{error}</div> : null}
        <button type="submit" disabled={busy || !passcode} style={styles.btn}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

const styles = {
  wrap: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#FAF6EF',
    fontFamily: "'Work Sans', system-ui, -apple-system, sans-serif",
    padding: 16,
  },
  card: {
    background: '#fff',
    border: '1px solid #E3D9C6',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    boxShadow: '0 4px 14px rgba(42,33,24,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  h1: { margin: 0, fontFamily: "'Fraunces', Georgia, serif", fontSize: 24, color: '#2A2118' },
  p: { margin: 0, color: '#6B5D4F', fontSize: 14 },
  input: {
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid #E3D9C6',
    fontSize: 16,
  },
  error: { color: '#B54A2A', fontSize: 13 },
  btn: {
    padding: '12px',
    borderRadius: 10,
    border: 'none',
    background: '#3F5D45',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  },
};
