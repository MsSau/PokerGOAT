import React, { useState, useEffect, useRef } from 'react';
import { supabase, getUserRole, testSupabaseConnection, fetchProfileCoachId } from './lib/supabase';
import { UserRole } from './types';
import { PlayerId, CoachId, asPlayerId } from './types/ids';
import AuthScreen from './components/AuthScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import PlayerShell from './components/PlayerShell';
import CoachShell from './components/CoachShell';
import { Shield, Clock3 } from 'lucide-react';

console.log('ENV CHECK', {
  url: import.meta.env.VITE_SUPABASE_URL,
  keyPrefix: import.meta.env.VITE_SUPABASE_ANON_KEY?.slice(0, 12)
});

// Captured synchronously at module load, before the supabase client's async
// URL-detection strips the fragment. A Supabase recovery email redirects to
// `<site>/#access_token=…&type=recovery`; an expired/used link redirects to
// `<site>/#error=access_denied&error_code=otp_expired&error_description=…`.
const INITIAL_HASH = typeof window !== 'undefined' ? window.location.hash : '';

function readRecoveryHash(hash: string): { isRecovery: boolean; error: string | null } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('error') || params.get('error_code')) {
    const desc = params.get('error_description');
    return {
      isRecovery: true,
      error: desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : 'This reset link is invalid or has expired.',
    };
  }
  return { isRecovery: params.get('type') === 'recovery', error: null };
}

const RECOVERY_HASH = readRecoveryHash(INITIAL_HASH);

// Survive a refresh mid-flow: the supabase client strips the token fragment
// from the URL as soon as it parses it, so without this a reload during the
// "set a new password" step would drop the user into the app on the still-live
// recovery token instead of back onto ResetPasswordScreen.
const RECOVERY_FLAG_KEY = 'pg_password_recovery';
function readRecoveryFlag(): boolean {
  try { return sessionStorage.getItem(RECOVERY_FLAG_KEY) === '1'; } catch { return false; }
}
function setRecoveryFlag(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(RECOVERY_FLAG_KEY, '1');
    else sessionStorage.removeItem(RECOVERY_FLAG_KEY);
  } catch { /* sessionStorage unavailable — non-fatal */ }
}
if (RECOVERY_HASH.isRecovery) setRecoveryFlag(true);

const RECOVERY_ACTIVE = RECOVERY_HASH.isRecovery || readRecoveryFlag();

export default function App() {
  const [session, setSession] = useState<{ userId: PlayerId; email: string; role: UserRole } | null>(null);
  const [loading, setLoading] = useState(true);
  // undefined = not checked yet, null = confirmed no coach assigned. Only
  // meaningful for role === 'PLAYER' — almost every player-side screen
  // hard-fails without a coach (resolveCoachId throws), which a freshly
  // self-registered player legitimately has none of until a coach claims
  // them (see CoachShell's "Unclaimed Players" panel).
  const [playerCoachId, setPlayerCoachId] = useState<CoachId | null | undefined>(undefined);
  // Password-recovery mode: the user arrived via a Supabase recovery link, so
  // we show ResetPasswordScreen instead of routing into the app — even though
  // a (short-lived) auth session now exists.
  const [recoveryMode, setRecoveryMode] = useState<boolean>(RECOVERY_ACTIVE);
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  // The onAuthStateChange listener is registered once and closes over the
  // initial recoveryMode value; this ref lets it see the current one.
  const recoveryModeRef = useRef<boolean>(RECOVERY_ACTIVE);

  const enterRecoveryMode = (email: string | null) => {
    recoveryModeRef.current = true;
    setRecoveryFlag(true);
    setRecoveryMode(true);
    setRecoveryEmail(email);
  };

  const exitRecoveryMode = (notice: string | null) => {
    recoveryModeRef.current = false;
    setRecoveryFlag(false);
    setRecoveryMode(false);
    setRecoveryEmail(null);
    setAuthNotice(notice);
  };

  useEffect(() => {
    if (!session || session.role !== 'PLAYER') {
      setPlayerCoachId(undefined);
      return;
    }
    let cancelled = false;
    fetchProfileCoachId(session.userId)
      .then((coachId) => { if (!cancelled) setPlayerCoachId(coachId); })
      .catch((err) => {
        console.error('Failed to resolve player coach assignment:', err);
        if (!cancelled) setPlayerCoachId(null);
      });
    return () => { cancelled = true; };
  }, [session]);

  // Initialize and check active user session on startup
  useEffect(() => {
    const initializeAuth = async () => {
      // Test Supabase connection
      await testSupabaseConnection();

      try {
        const { data: { session: sbSession } } = await supabase.auth.getSession();

        if (sbSession?.user && !recoveryModeRef.current) {
          const email = sbSession.user.email || '';
          const userId = asPlayerId(sbSession.user.id);
          const role = await getUserRole(userId, email);
          setSession({
            userId,
            email,
            role,
          });
        } else if (sbSession?.user && recoveryModeRef.current) {
          setRecoveryEmail(sbSession.user.email || null);
        }
      } catch (err) {
        console.error('Error during auth initialization:', err);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Set up auth event listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sbSession) => {
      // Recovery link detected: stay on ResetPasswordScreen, don't route in.
      if (event === 'PASSWORD_RECOVERY') {
        enterRecoveryMode(sbSession?.user?.email || null);
        return;
      }
      // While the recovery flow is open, ignore the transient sessions
      // (INITIAL_SESSION, USER_UPDATED) that would otherwise route the user
      // into the app on a recovery token before they've set a new password.
      if (recoveryModeRef.current && event !== 'SIGNED_OUT') {
        if (sbSession?.user) setRecoveryEmail(sbSession.user.email || null);
        return;
      }

      if (sbSession?.user) {
        const email = sbSession.user.email || '';
        const userId = asPlayerId(sbSession.user.id);
        try {
          const role = await getUserRole(userId, email);
          setSession({
            userId,
            email,
            role,
          });
        } catch (err) {
          // Fires unhandled here (this listener has no other error path)
          // immediately after signUp, for the brief window between a new
          // auth session existing and its `profiles` row being created —
          // AuthScreen's own registration flow calls onAuthSuccess directly
          // once that row exists, so this is a transient miss to log, not
          // a real failure to surface.
          console.error('Auth state change: role lookup failed (expected transiently right after sign-up):', err);
        }
      } else {
        setSession(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error during sign out:', err);
    }
    setSession(null);
  };

  const handleAuthSuccess = (newSession: { userId: PlayerId; email: string; role: UserRole }) => {
    setSession(newSession);
  };

  // Rendering loading state
  if (loading) {
    return (
      <div id="app-loading" className="min-h-screen bg-ink flex flex-col items-center justify-center gap-4 text-text-primary font-sans select-none">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-surface-raised border border-border flex items-center justify-center text-accent-steel shadow-md">
            <Shield size={24} className="animate-pulse text-accent-steel" />
          </div>
          <h2 className="font-display text-20 font-medium mt-3">PokerGOAT</h2>
          <p className="text-12 font-mono text-text-muted">Loading secure session profiles...</p>
        </div>
      </div>
    );
  }

  // Password-recovery link — set a new password before anything else.
  if (recoveryMode) {
    return (
      <ResetPasswordScreen
        email={recoveryEmail}
        initialError={RECOVERY_HASH.error}
        onComplete={exitRecoveryMode}
      />
    );
  }

  // Handle unauthenticated state
  if (!session) {
    return (
      <AuthScreen
        onAuthSuccess={handleAuthSuccess}
        notice={authNotice}
        onNoticeDismiss={() => setAuthNotice(null)}
      />
    );
  }

  // Handle authenticated routing to the correct Lens
  if (session.role === 'COACH') {
    return (
      <CoachShell
        userId={session.userId}
        userEmail={session.email}
        onLogout={handleLogout}
      />
    );
  }

  // A freshly self-registered player has no coach yet — almost every
  // player-side screen hard-fails without one, so wait for
  // fetchProfileCoachId to resolve, and show a dedicated screen instead of
  // PlayerShell if it comes back null (see CoachShell's "Unclaimed Players"
  // panel — that's what moves a player out of this state).
  if (playerCoachId === undefined) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center text-text-primary font-sans select-none">
        <span className="w-8 h-8 border-2 border-accent-steel border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (playerCoachId === null) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center p-6 font-sans select-none">
        <div className="w-full max-w-md bg-surface border border-border rounded-[6px] shadow-2xl p-8 flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-signal-caution/10 border border-signal-caution/30 flex items-center justify-center text-signal-caution">
            <Clock3 size={22} />
          </div>
          <h1 className="font-display text-20 font-medium text-text-primary">Waiting for your coach</h1>
          <p className="text-13 text-text-muted leading-relaxed">
            Your account is registered, but you haven't been added to a coach's roster yet. Once a coach adds you,
            just refresh or sign back in to get started.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="text-12 text-accent-steel hover:underline mt-2"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <PlayerShell
      userId={session.userId}
      userEmail={session.email}
      onLogout={handleLogout}
    />
  );
}
