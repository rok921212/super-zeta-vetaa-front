// The account lock in the Designer (useAccountLock.ts): while it covers the
// Designer, a strip says so and takes the password to unlock; otherwise a
// small "Lock" control locks the account (Auto Switcher + Designer, as the
// admin set it up). The password is checked on the server; nothing is stored here.

import React, { useState } from 'react';
import { Btn } from './ui.tsx';
import { useAccountLock } from './useAccountLock.ts';

export function AccountLockBar({ compact = false }: { compact?: boolean }) {
  const lock = useAccountLock();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!lock.loaded) return null;
  // Nothing to offer: unlocked and no password set up on the server.
  if (!lock.designerLocked && !lock.available) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await lock.setLocked(!lock.designerLocked, password);
    setBusy(false);
    setError(err);
    if (!err) { setPassword(''); setOpen(false); }
  };

  const form = open && (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        className="w-44 rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white"
        placeholder="Account lock password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        data-testid="account-lock-password"
      />
      <Btn small active disabled={busy || !password} type="submit">{busy ? '…' : lock.designerLocked ? 'Unlock' : 'Lock'}</Btn>
      <Btn small type="button" onClick={() => { setOpen(false); setError(null); }}>Cancel</Btn>
    </form>
  );

  if (lock.designerLocked) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-100" data-testid="account-lock-bar">
        <span>🔒 The Designer is locked for this account (account lock). You can look around, but saving, publishing, importing and deleting are blocked.</span>
        {form || <Btn small onClick={() => setOpen(true)}>Unlock…</Btn>}
        {error && <span className="text-rose-300">{error}</span>}
      </div>
    );
  }

  if (compact && !open) {
    return (
      <Btn small onClick={() => setOpen(true)} title="Lock the Designer (and the Auto Switcher) with the account lock password" data-testid="account-lock-button">
        🔒 Lock
      </Btn>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      {form || <Btn small onClick={() => setOpen(true)}>🔒 Lock</Btn>}
      {error && <span className="text-rose-300">{error}</span>}
    </div>
  );
}
