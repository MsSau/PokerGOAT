import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../lib/utils';
import { Shield, Lock, ArrowRight, AlertCircle } from 'lucide-react';

interface ResetPasswordScreenProps {
  // Email of the recovery session, once App's auth listener has resolved it.
  // May be null on first render (the PASSWORD_RECOVERY event can land before
  // this screen mounts) — we re-resolve it ourselves from getSession().
  email: string | null;
  // Non-null when the redirect URL carried an `error`/`error_code` fragment
  // (expired or already-used link) instead of real tokens.
  initialError: string | null;
  // Called after the password is changed (and the temporary recovery session
  // signed out) or when the user gives up on a dead link. The notice, if any,
  // is surfaced on the sign-in screen.
  onComplete: (notice: string | null) => void;
}

type Phase = 'checking' | 'form' | 'invalid' | 'saving';

// Supabase's own default minimum is 6; projects often raise it. We ask for 8
// client-side and let the server reject anything its policy considers weaker.
const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordScreen({ email, initialError, onComplete }: ResetPasswordScreenProps) {
  const [phase, setPhase] = useState<Phase>(initialError ? 'invalid' : 'checking');
  const [sessionEmail, setSessionEmail] = useState<string | null>(email);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (email) setSessionEmail(email);
  }, [email]);

  // Resolve the recovery session ourselves rather than trusting the prop: the
  // supabase client processes the URL hash asynchronously and fires
  // PASSWORD_RECOVERY once, which App's listener may register too late to
  // catch. If nothing produces a session within a few seconds, the link is
  // dead.
  useEffect(() => {
    if (initialError) return;
    let cancelled = false;

    const adopt = (userEmail: string | null | undefined) => {
      if (cancelled) return;
      setSessionEmail(userEmail ?? null);
      if (phaseRef.current === 'checking') setPhase('form');
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) adopt(data.session.user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) adopt(session.user.email);
    });

    const timer = setTimeout(() => {
      if (!cancelled && phaseRef.current === 'checking') setPhase('invalid');
    }, 4000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [initialError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setPhase('saving');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      // Drop the short-lived recovery session so the user re-authenticates
      // with the new password — a clean, unambiguous end state rather than
      // silently landing them inside the app on a recovery token.
      await supabase.auth.signOut();
      onComplete('Password updated. Sign in with your new password.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update your password. The reset link may have expired.'));
      setPhase('form');
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center bg-ink p-6 select-none font-sans">
      <div className="w-full max-w-md bg-surface border border-border rounded-[6px] shadow-2xl p-8 flex flex-col gap-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-full bg-surface-raised border border-border flex items-center justify-center text-accent-steel shadow-md">
            <Shield size={24} />
          </div>
          <h1 className="font-display text-28 font-medium tracking-tight text-text-primary mt-2">PokerGOAT</h1>
          <p className="text-14 text-text-muted italic">Set a new password</p>
        </div>
        {children}
      </div>
    </div>
  );

  if (phase === 'checking') {
    return shell(
      <div className="flex flex-col items-center gap-3 py-6">
        <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin" />
        <p className="text-12 font-mono text-text-muted">Verifying your reset link…</p>
      </div>
    );
  }

  if (phase === 'invalid') {
    return shell(
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <div className="w-10 h-10 rounded-full bg-signal-risk/10 border border-signal-risk/30 flex items-center justify-center text-signal-risk">
          <AlertCircle size={18} />
        </div>
        <p className="text-14 text-text-primary font-medium">This reset link is invalid or has expired</p>
        <p className="text-12 text-text-muted leading-relaxed">
          {initialError || 'Password reset links can only be used once and expire an hour after they are sent.'}
        </p>
        <button
          type="button"
          onClick={() => onComplete(null)}
          className="mt-2 text-12 text-accent-steel hover:underline"
        >
          Back to sign in — request a new link
        </button>
      </div>
    );
  }

  return shell(
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {sessionEmail && (
        <p className="text-12 text-text-muted text-center font-mono">
          Resetting the password for <span className="text-text-primary">{sessionEmail}</span>
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-12 font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
          <Lock size={12} /> New Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
          placeholder="••••••••"
          autoComplete="new-password"
          className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] px-3 py-2 text-14 text-text-primary placeholder:text-text-faint transition-colors w-full font-mono"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-12 font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
          <Lock size={12} /> Confirm New Password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); if (error) setError(null); }}
          placeholder="••••••••"
          autoComplete="new-password"
          className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] px-3 py-2 text-14 text-text-primary placeholder:text-text-faint transition-colors w-full font-mono"
          required
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 text-signal-risk bg-signal-risk/10 p-3 rounded-[4px] border border-signal-risk/25">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p className="text-12 text-left leading-relaxed">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={phase === 'saving'}
        className="w-full h-10 bg-accent-steel text-text-primary rounded-[4px] hover:bg-accent-steel/95 font-sans font-medium text-14 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
      >
        {phase === 'saving' ? (
          <span className="w-5 h-5 border-2 border-text-primary border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            <span>Update Password</span>
            <ArrowRight size={16} />
          </>
        )}
      </button>

      <button
        type="button"
        onClick={() => onComplete(null)}
        className="text-11 text-text-faint hover:text-text-muted text-center"
      >
        Cancel and return to sign in
      </button>
    </form>
  );
}
