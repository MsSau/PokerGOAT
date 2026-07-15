import React, { useState, useEffect } from 'react';
import { supabase, getUserRole, testSupabaseConnection } from './lib/supabase';
import { UserRole } from './types';
import AuthScreen from './components/AuthScreen';
import PlayerShell from './components/PlayerShell';
import CoachShell from './components/CoachShell';
import { Shield } from 'lucide-react';

console.log('ENV CHECK', {
  url: import.meta.env.VITE_SUPABASE_URL,
  keyPrefix: import.meta.env.VITE_SUPABASE_ANON_KEY?.slice(0, 12)
});

export default function App() {
  const [session, setSession] = useState<{ userId: string; email: string; role: UserRole } | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize and check active user session on startup
  useEffect(() => {
    const initializeAuth = async () => {
      // Test Supabase connection
      await testSupabaseConnection();
      
      try {
        const { data: { session: sbSession } } = await supabase.auth.getSession();
        
        if (sbSession?.user) {
          const email = sbSession.user.email || '';
          const role = await getUserRole(sbSession.user.id, email);
          setSession({
            userId: sbSession.user.id,
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
        const role = await getUserRole(sbSession.user.id, email);
        setSession({
          userId: sbSession.user.id,
          email,
          role,
        });
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
    localStorage.removeItem('pokergoat_role_override');
  };

  const handleSwitchRole = (newRole: UserRole) => {
    if (session) {
      // Set an override in localStorage so reloading preserves the toggled role
      localStorage.setItem('pokergoat_role_override', newRole);
      setSession({
        ...session,
        role: newRole,
      });
    }
  };

  const handleAuthSuccess = (newSession: { userId: string; email: string; role: UserRole }) => {
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
        onSwitchRole={handleSwitchRole}
      />
    );
  }

  return (
    <PlayerShell
      userId={session.userId}
      userEmail={session.email}
      onLogout={handleLogout}
      onSwitchRole={handleSwitchRole}
    />
  );
}
