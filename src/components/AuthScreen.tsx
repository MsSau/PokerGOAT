import React, { useState } from 'react';
import { supabase, getUserRole } from '../lib/supabase';
import { getErrorMessage } from '../lib/utils';
import { UserRole } from '../types';
import { Shield, User, Lock, ArrowRight, AlertCircle } from 'lucide-react';

interface AuthScreenProps {
  onAuthSuccess: (session: { userId: string; email: string; role: UserRole }) => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const role = await getUserRole(data.user.id, userEmail);

        setLoading(false);
        onAuthSuccess({
          userId: data.user.id,
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
      </div>
    </div>
  );
}
