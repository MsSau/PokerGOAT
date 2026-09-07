import React, { useState } from 'react';
import { supabase, getUserRole, registerPlayer, registerCoach } from '../lib/supabase';
import { getErrorMessage } from '../lib/utils';
import { UserRole } from '../types';
import { PlayerId, asPlayerId } from '../types/ids';
import { Shield, User, Lock, ArrowRight, AlertCircle, UserPlus, LogIn, Award, CheckCircle2 } from 'lucide-react';

interface AuthScreenProps {
  onAuthSuccess: (session: { userId: PlayerId; email: string; role: UserRole }) => void;
  // One-shot banner shown above the form (e.g. after a password reset).
  notice?: string | null;
  onNoticeDismiss?: () => void;
}

type Mode = 'signin' | 'register';

export default function AuthScreen({ onAuthSuccess, notice, onNoticeDismiss }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('signin');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Forgot password?" — sends a Supabase recovery email that redirects back
  // to this origin, where App.tsx routes it to ResetPasswordScreen.
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const handleForgotPassword = async () => {
    if (!email) {
      setResetMsg('Enter your email address above, then click “Forgot password?” again.');
      return;
    }
    setResetState('sending');
    setResetMsg(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resetError) throw resetError;
      setResetState('sent');
      setResetMsg(`If an account exists for ${email}, a password reset link is on its way. Check your inbox.`);
    } catch (err) {
      setResetState('idle');
      setResetMsg(getErrorMessage(err, 'Could not send a reset link right now. Try again shortly.'));
    }
  };

  // Pre-seeded credentials for user testing convenience
  const testAccounts = [
    {
      label: 'Player Demo Account',
      email: 'saumyabharati18@gmail.com',
      password: 'poker123',
      role: 'PLAYER' as UserRole,
      description: 'Default player with active session & planning dashboard',
    },
    {
      label: 'Coach Demo Account',
      email: 'coach@example.com',
      password: 'poker123',
      role: 'COACH' as UserRole,
      description: 'Default coach with Player grid and Weekly Brief overview',
    },
  ];

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Attempt real Supabase sign-in
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (data.user) {
        // 2. Fetch the caller's role from profiles row
        const userEmail = data.user.email || '';
        const userId = asPlayerId(data.user.id);
        const role = await getUserRole(userId, userEmail);

        setLoading(false);
        onAuthSuccess({
          userId,
          email: userEmail,
          role,
        });
      } else {
        throw new Error('Authentication failed: user record not found.');
      }
    } catch (err) {
      let message = getErrorMessage(err, 'An unexpected error occurred during sign-in.');
      if (message.includes('Email not confirmed')) {
        message = 'Your email address has not been confirmed. Please check your inbox for the confirmation link.';
      }
      setError(message);
      setLoading(false);
    }
  };

  const handleQuickSelect = (acc: typeof testAccounts[number]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setError(null);
  };

  return (
    <div id="auth-screen" className="min-h-screen flex items-center justify-center bg-ink p-6 select-none font-sans">
      <div className="w-full max-w-md bg-surface border border-border rounded-[6px] shadow-2xl p-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-full bg-surface-raised border border-border flex items-center justify-center text-accent-steel shadow-md">
            <Shield size={24} />
          </div>
          <h1 className="font-display text-28 font-medium tracking-tight text-text-primary mt-2">
            PokerGOAT
          </h1>
          <p className="text-14 text-text-muted italic">
            Build your edge. Protect your bankroll. Master your process.
          </p>
        </div>

        {notice && (
          <div className="flex items-start gap-2 text-signal-process bg-signal-process/10 p-3 rounded-[4px] border border-signal-process/25">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <p className="text-12 text-left leading-relaxed flex-1">{notice}</p>
            {onNoticeDismiss && (
              <button
                type="button"
                onClick={onNoticeDismiss}
                className="text-11 text-text-faint hover:text-text-muted shrink-0"
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {/* Sign In / Register toggle */}
        <div className="grid grid-cols-2 gap-2 bg-surface-raised p-1 rounded-[6px] border border-border">
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(null); }}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-[4px] text-13 font-medium transition-colors ${
              mode === 'signin' ? 'bg-ink text-text-primary border border-accent-steel/40' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <LogIn size={13} /> Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); }}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-[4px] text-13 font-medium transition-colors ${
              mode === 'register' ? 'bg-ink text-text-primary border border-accent-steel/40' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <UserPlus size={13} /> Register
          </button>
        </div>

        {mode === 'signin' ? (
          <>
            {/* Quick Demo Accounts Selection */}
            <div className="flex flex-col gap-2 bg-surface-raised p-4 rounded-[6px] border border-border">
              <span className="text-12 font-mono text-text-muted uppercase tracking-wider">
                Quick-Fill Test Accounts (Seed / Simulation)
              </span>
              <div className="flex flex-col gap-2 mt-2">
                {testAccounts.map((acc) => {
                  const isSelected = email === acc.email;
                  return (
                    <button
                      key={acc.role}
                      type="button"
                      onClick={() => handleQuickSelect(acc)}
                      className={`text-left p-3 rounded-[4px] border transition-all flex items-center justify-between group ${
                        isSelected
                          ? 'bg-ink border-accent-steel text-text-primary'
                          : 'bg-surface border-border text-text-muted hover:border-text-faint'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className={`text-14 font-medium transition-colors ${isSelected ? 'text-text-primary' : 'text-text-primary/90'}`}>
                          {acc.label}
                        </span>
                        <span className="text-12 text-text-muted font-mono mt-0.5">
                          {acc.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-12 font-mono px-2 py-0.5 rounded-full bg-ink border border-border text-text-muted uppercase text-[10px]">
                          {acc.role}
                        </span>
                        <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-accent-steel" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Sign-In Form */}
            <form onSubmit={handleSignIn} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-12 font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <User size={12} /> Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. player@pokergoat.com"
                  className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] px-3 py-2 text-14 text-text-primary placeholder:text-text-faint transition-colors w-full font-mono"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-12 font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Lock size={12} /> Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="••••••••"
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
                type="button"
                onClick={handleForgotPassword}
                disabled={resetState === 'sending'}
                className="self-end text-11 text-accent-steel hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {resetState === 'sending' ? 'Sending reset link…' : 'Forgot password?'}
              </button>

              {resetMsg && (
                <p
                  className={`text-11 leading-relaxed ${
                    resetState === 'sent' ? 'text-signal-process' : 'text-text-muted'
                  }`}
                >
                  {resetMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-accent-steel text-text-primary rounded-[4px] hover:bg-accent-steel/95 font-sans font-medium text-14 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-text-primary border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="text-center">
              <p className="text-12 text-text-faint">
                Auth restricted to registered email and password keys.
              </p>
            </div>
          </>
        ) : (
          <RegisterForm onAuthSuccess={onAuthSuccess} />
        )}
      </div>
    </div>
  );
}

function RegisterForm({ onAuthSuccess }: AuthScreenProps) {
  const [role, setRole] = useState<UserRole>('PLAYER');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [openingBankroll, setOpeningBankroll] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password || !displayName.trim()) {
      setError('Email, password, and name are all required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const bankrollAmount = role === 'PLAYER' ? parseFloat(openingBankroll) : 0;
    if (role === 'PLAYER' && (isNaN(bankrollAmount) || bankrollAmount <= 0)) {
      setError('Enter a positive opening bankroll amount.');
      return;
    }

    setLoading(true);
    try {
      const result =
        role === 'PLAYER'
          ? await registerPlayer({ email, password, displayName: displayName.trim(), openingBankroll: bankrollAmount })
          : await registerCoach({ email, password, displayName: displayName.trim() });

      if (result.status === 'pending_confirmation') {
        setPendingConfirmation(true);
        setLoading(false);
        return;
      }

      // A real session now exists — App.tsx's own auth listener will pick
      // this up and route by role, same contract sign-in already uses.
      onAuthSuccess({ userId: asPlayerId(result.userId), email, role });
    } catch (err) {
      setError(getErrorMessage(err, 'Registration failed.'));
      setLoading(false);
    }
  };

  if (pendingConfirmation) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-4">
        <div className="w-10 h-10 rounded-full bg-signal-caution/10 border border-signal-caution/30 flex items-center justify-center text-signal-caution">
          <AlertCircle size={18} />
        </div>
        <p className="text-14 text-text-primary font-medium">Confirm your email to finish registering</p>
        <p className="text-12 text-text-muted leading-relaxed">
          We sent a confirmation link to {email}. Once confirmed, sign in normally to complete your account setup.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleRegister} className="flex flex-col gap-4">
      {/* Role toggle */}
      <div className="grid grid-cols-2 gap-2">
        {(['PLAYER', 'COACH'] as UserRole[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-[4px] border text-13 font-medium transition-colors ${
              role === r ? 'border-accent-steel bg-accent-steel/10 text-text-primary' : 'border-border text-text-muted hover:border-text-faint'
            }`}
          >
            <Award size={13} /> {r === 'PLAYER' ? 'Player' : 'Coach'}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-12 font-mono text-text-muted uppercase tracking-wider">
          {role === 'PLAYER' ? 'Player Name' : 'Coach Name'}
        </label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Alex Sharma"
          className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] px-3 py-2 text-14 text-text-primary placeholder:text-text-faint transition-colors w-full font-mono"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-12 font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
          <User size={12} /> Email Address
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. player@pokergoat.com"
          className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] px-3 py-2 text-14 text-text-primary placeholder:text-text-faint transition-colors w-full font-mono"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-12 font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <Lock size={12} /> Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] px-3 py-2 text-14 text-text-primary placeholder:text-text-faint transition-colors w-full font-mono"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Confirm</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] px-3 py-2 text-14 text-text-primary placeholder:text-text-faint transition-colors w-full font-mono"
            required
          />
        </div>
      </div>

      {role === 'PLAYER' && (
        <div className="flex flex-col gap-1.5">
          <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Opening Bankroll (₹)</label>
          <input
            type="number"
            min={0}
            value={openingBankroll}
            onChange={(e) => setOpeningBankroll(e.target.value)}
            placeholder="e.g. 50000"
            className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] px-3 py-2 text-14 text-text-primary placeholder:text-text-faint transition-colors w-full font-mono"
            required
          />
          <p className="text-11 text-text-faint leading-relaxed">
            Your starting capital, recorded once at registration. Once you're mapped to a coach they'll see this
            on your roster entry.
          </p>
        </div>
      )}

      {role === 'COACH' && (
        <p className="text-11 text-text-faint leading-relaxed">
          After registering you'll be able to add unclaimed players to your roster from the Brief tab.
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 text-signal-risk bg-signal-risk/10 p-3 rounded-[4px] border border-signal-risk/25">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p className="text-12 text-left leading-relaxed">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full h-10 bg-accent-steel text-text-primary rounded-[4px] hover:bg-accent-steel/95 font-sans font-medium text-14 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
      >
        {loading ? (
          <span className="w-5 h-5 border-2 border-text-primary border-t-transparent rounded-full animate-spin"></span>
        ) : (
          <>
            <span>Register as {role === 'PLAYER' ? 'Player' : 'Coach'}</span>
            <ArrowRight size={16} />
          </>
        )}
      </button>
    </form>
  );
}
