import React, { useState, useEffect } from 'react';
import { supabase, getUserRole, testSupabaseConnection, fetchProfileCoachId } from './lib/supabase';
import { UserRole } from './types';
import { PlayerId, CoachId, asPlayerId } from './types/ids';
import AuthScreen from './components/AuthScreen';
import PlayerShell from './components/PlayerShell';
import CoachShell from './components/CoachShell';
import { Shield, Clock3 } from 'lucide-react';

console.log('ENV CHECK', {
  url: import.meta.env.VITE_SUPABASE_URL,
  keyPrefix: import.meta.env.VITE_SUPABASE_ANON_KEY?.slice(0, 12)
});

export default function App() {
  const [session, setSession] = useState<{ userId: PlayerId; email: string; role: UserRole } | null>(null);
  const [loading, setLoading] = useState(true);
  // undefined = not checked yet, null = confirmed no coach assigned. Only
  // meaningful for role === 'PLAYER' — almost every player-side screen
  // hard-fails without a coach (resolveCoachId throws), which a freshly
  // self-registered player legitimately has none of until a coach claims
  // them (see CoachShell's "Unclaimed Players" panel).
  const [playerCoachId, setPlayerCoachId] = useState<CoachId | null | undefined>(undefined);

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

        if (sbSession?.user) {
          const email = sbSession.user.email || '';
          const userId = asPlayerId(sbSession.user.id);
          const role = await getUserRole(userId, email);
          setSession({
            userId,
            email,
            role,
          });
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

  // Handle unauthenticated state
  if (!session) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
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
