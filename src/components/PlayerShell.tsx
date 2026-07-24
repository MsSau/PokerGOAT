import React, { useEffect, useState } from 'react';
import { PlayerRoute, UserRole, ActiveSession } from '../types';
import ActiveFrameworkView from './ActiveFrameworkView';
import ActiveBRMView from './ActiveBRMView';
import { PlayerDashboard } from './PlayerDashboard';
import {
  LayoutDashboard,
  Sparkles,
  CalendarDays,
  Swords,
  History,
  TrendingUp,
  Award,
  AlertTriangle,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  CheckCircle,
  ExternalLink,
  DollarSign
} from 'lucide-react';
import WeeklyGamePlanView from './WeeklyGamePlanView';
import SessionContractView from './SessionContractView';
import TournamentLog from './TournamentLog';
import { fetchLatestBRMAssignment, fetchActiveSession, supabase } from '../lib/supabase';
import SessionReview from './SessionReview';
import { stopSessionForReview, resumeSessionForEditing } from '../lib/endSession';
import SessionLog from './SessionLog';
import PreparationView from './PreparationView';
import BehavioralProfileView from './BehavioralProfileView';
import VerdictsView from './VerdictsView';
import PlayerInterventionsView from './PlayerInterventionsView';
import { countActiveAssignmentsForPlayer } from '../lib/interventions';
import { useAsync } from '../lib/useAsync';


interface PlayerShellProps {
  userId: string;
  userEmail: string;
  onLogout: () => void;
  onSwitchRole: (role: UserRole) => void;
}

export default function PlayerShell({ userId, userEmail, onLogout, onSwitchRole }: PlayerShellProps) {
  // Navigation & UI State
  const [activeTab, setActiveTab] = useState<PlayerRoute>('dashboard');
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);

  const [sessionLoading, setSessionLoading] = useState(true);

  // Real Coach-Assigned Interventions count for the rail badge (PRD §16).
  // refreshKey bumps after the Interventions tab marks one complete, so the
  // badge doesn't keep showing a stale count until the next full remount.
  const [interventionRefreshKey, setInterventionRefreshKey] = useState(0);
  const { data: activeInterventionCount } = useAsync(
    () => countActiveAssignmentsForPlayer(userId),
    [userId, interventionRefreshKey],
  );
  const hasIntervention = (activeInterventionCount ?? 0) > 0;

  // Active Session state
const [session, setSession] = useState<ActiveSession>({
  id: null,
  contractId: null,
  isActive: false,
  status: 'NONE', // ← add
  startTime: null,
  sessionLimit: 0,
  dayLimit: 0,
  weekLimit: 0,
  stopLossConsumed: 0,
  confidenceScore: 85,
});

useEffect(() => {
  fetchLatestBRMAssignment(userId)
    .then((data) => {
      if (data) {
        setSession((prev) => ({
          ...prev,
          sessionLimit: data.session_stop_loss_snapshot || 0,
          dayLimit: data.day_stop_loss_snapshot || 0,
          weekLimit: data.week_stop_loss_snapshot || 0,
        }));
      }
    })
    .catch(console.error);
}, [userId]);

useEffect(() => {
  let cancelled = false;
  async function hydrateSession() {
    setSessionLoading(true);
    try {
      // ACTIVE session takes priority
      const active = await fetchActiveSession(userId);
      if (active && !cancelled) {
        setSession((prev) => ({
          ...prev,
          id: active.id,
          contractId: active.contract_id,
          isActive: true,
          status: 'ACTIVE',
          startTime: active.start_time,
        }));
        return;
      }

      // Otherwise check for a session stuck in REVIEW_PENDING
      const { data: pending, error } = await supabase
        .from('sessions')
        .select('id, contract_id, start_time, status')
        .eq('player_id', userId)
        .eq('status', 'REVIEW_PENDING')
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (pending && !cancelled) {
        setSession((prev) => ({
          ...prev,
          id: pending.id,
          contractId: pending.contract_id,
          isActive: false,
          status: 'REVIEW_PENDING',
          startTime: pending.start_time,
        }));
      }
    } catch (err) {
      //console.error('Failed to hydrate session state:', err);
      console.error("HYDRATE ERROR");
console.error(err);
console.error(JSON.stringify(err, null, 2));
    } finally {
      if (!cancelled) setSessionLoading(false);
    }
  }
  hydrateSession();
  return () => { cancelled = true; };
}, [userId]);

const handleSessionStarted = (sessionId: string) => {
  setSession((prev) => ({ ...prev, id: sessionId, isActive: true, status: 'ACTIVE', startTime: new Date().toISOString() }));
};

// Step 1 of 2 — stops the clock only. No scoring happens here.
const handleEndSessionClicked = async () => {
  if (!session.id) return;
  try {
    await stopSessionForReview(session.id);
    setSession((prev) => ({ ...prev, status: 'REVIEW_PENDING' }));
  } catch (err) {
    console.error('Failed to stop session:', err);
  }
};

// Step 2 of 2 — review submitted, perform_end_session already ran and the
// session is now FINALIZED server-side.
const handleReviewComplete = () => {
  setSession((prev) => ({ ...prev, isActive: false, status: 'FINALIZED', startTime: null }));
  setActiveTab('log'); // land on the Log tab so the player sees the just-finalized session's medals/verdict
};

// Lets the player back out of review (confirm-entries step's "Edit
// Entries" button) to fix/add tournament entries before finalizing —
// the reverse of handleEndSessionClicked, restoring TournamentLog.
const handleGoBackToEdit = async () => {
  if (!session.id) return;
  await resumeSessionForEditing(session.id);
  setSession((prev) => ({ ...prev, status: 'ACTIVE' }));
};
  

  //const handleSessionStarted = (sessionId: string) => {
    //setSession((prev) => ({...prev, id: sessionId, isActive: true, startTime: new Date().toISOString() }));
  //};


  //const handleStopSession = () => {
    //setSession((prev) => ({
      //...prev,
      //isActive: false,
      //startTime: null,
    //}));
  //};

  // Navigation Items
  const navItems = [
    { id: 'dashboard' as PlayerRoute, label: 'Command Centre', icon: LayoutDashboard },   
    { id: 'plan' as PlayerRoute, label: 'Plan', icon: CalendarDays, sub: 'Weekly Game Plan' },
    { id: 'prepare' as PlayerRoute, label: 'Prepare', icon: Sparkles,sub: 'Before Session' },
    { id: 'play' as PlayerRoute, label: 'Play', icon: Swords, sub: 'Session Contract' },
    { id: 'log' as PlayerRoute, label: 'Log', icon: History, sub: 'Session Records' },
    { id: 'progress' as PlayerRoute, label: 'Progress', icon: TrendingUp, sub: 'Behavioral Profile' },
    { id: 'verdicts' as PlayerRoute, label: 'Verdicts', icon: Award, sub: 'Coach Decisions' },
    { id: 'interventions' as PlayerRoute, label: 'Interventions', icon: AlertTriangle, sub: 'Coach Assigned' },
  ];

  return (
    <div id="player-layout" className="min-h-screen flex bg-ink text-text-primary font-sans select-none overflow-hidden">
      
      {/* 1. PERSISTENT LEFT RAIL */}
      <aside 
        className={`bg-surface border-r border-border flex flex-col justify-between transition-all duration-300 relative z-10 shrink-0 ${
          isRailCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Rail Header */}
        <div className="h-16 border-b border-border flex items-center px-4 justify-between gap-2">
          {!isRailCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-[4px] bg-accent-steel/10 border border-accent-steel/30 flex items-center justify-center font-display font-medium text-16 text-accent-steel">
                P
              </div>
              <span className="font-display font-semibold text-16 text-text-primary tracking-tight">
                PokerGOAT
              </span>
              <span className="font-mono text-[9px] bg-surface-raised border border-border px-1.5 py-0.5 rounded text-text-muted">
                PLAYER
              </span>
            </div>
          )}
          {isRailCollapsed && (
            <div className="w-8 h-8 rounded-[4px] bg-accent-steel/10 border border-accent-steel/30 flex items-center justify-center font-display font-semibold text-14 text-accent-steel mx-auto">
              PG
            </div>
          )}
          
          {/* Collapse Toggle */}
          <button 
            type="button"
            onClick={() => setIsRailCollapsed(!isRailCollapsed)}
            className="p-1 rounded bg-surface-raised border border-border text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            title={isRailCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isRailCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Rail Navigation Links */}
        <nav className="flex-1 py-4 px-2 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center rounded-[4px] py-2.5 px-3 transition-colors text-left relative group cursor-pointer ${
                  isActive 
                    ? 'bg-surface-raised text-text-primary border-l-[3px] border-accent-steel' 
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-raised/50'
                }`}
              >
                <Icon size={18} className={`shrink-0 ${isActive ? 'text-accent-steel' : 'text-text-muted'}`} />
                {!isRailCollapsed && (
                  <div className="ml-3 flex flex-col leading-tight">
                    <span className="text-14 font-medium">{item.label}</span>
                    {item.sub && (
                      <span className="text-[10px] text-text-faint font-mono">
                        {item.sub}
                      </span>
                    )}
                  </div>
                )}
                {isRailCollapsed && (
                  <div className="absolute left-16 bg-surface-raised border border-border px-2.5 py-1 rounded-[4px] text-12 text-text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg pointer-events-none">
                    {item.label} {item.sub && `(${item.sub})`}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom of Rail Indicators */}
        <div className="border-t border-border p-2 flex flex-col gap-2 bg-ink/30">
          
          {/* Coach-Assigned Interventions Badge — real ASSIGNED count, links to the tab */}
          {hasIntervention && (
            <button
              type="button"
              onClick={() => setActiveTab('interventions')}
              className={`flex items-center rounded-[4px] p-2 bg-signal-risk/5 border border-signal-risk/20 cursor-pointer text-left ${
                isRailCollapsed ? 'justify-center' : 'justify-between'
              }`}
              title="Coach Pending Intervention Assigned"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-signal-risk shrink-0 animate-pulse" />
                {!isRailCollapsed && (
                  <span className="text-12 font-medium text-signal-risk">
                    Intervention Active
                  </span>
                )}
              </div>
              {!isRailCollapsed && (
                <span className="bg-signal-risk text-text-primary font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-[999px]">
                  {activeInterventionCount}
                </span>
              )}
            </button>
          )}

          {/* Account & Session Controls */}
          <div className="border-t border-border/60 pt-2 flex flex-col gap-1.5">
            {/* Account Display */}
            <div className={`flex items-center gap-2.5 p-1.5 ${isRailCollapsed ? 'justify-center' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-surface-raised border border-border flex items-center justify-center text-text-muted shrink-0">
                <User size={14} />
              </div>
              {!isRailCollapsed && (
                <div className="flex-1 min-w-0 flex flex-col leading-tight">
                  <span className="text-12 font-medium text-text-primary truncate" title={userEmail}>
                    {userEmail.split('@')[0]}
                  </span>
                  <span className="text-[10px] text-text-muted truncate">
                    {userEmail}
                  </span>
                </div>
              )}
            </div>

            {/* Simulated Toggle Helpers */}
            {!isRailCollapsed && (
              <div className="px-1.5 py-1 bg-surface-raised/40 rounded border border-border/40 text-[10px] flex flex-col gap-1 text-text-muted">
                <span className="font-mono text-[9px] uppercase tracking-wide text-text-faint">
                  Sandbox Controls
                </span>
                <button
                  type="button"
                  onClick={() => onSwitchRole('COACH')}
                  className="w-full text-center mt-1 py-1 rounded bg-accent-steel/10 border border-accent-steel/30 text-accent-steel hover:bg-accent-steel/20 font-sans transition-colors"
                >
                  Switch to Coach Shell
                </button>
              </div>
            )}

            {/* Logout Button */}
            <button
              type="button"
              onClick={onLogout}
              className={`w-full flex items-center rounded-[4px] p-2 hover:bg-signal-risk/10 text-text-muted hover:text-signal-risk transition-colors text-left cursor-pointer ${
                isRailCollapsed ? 'justify-center' : ''
              }`}
            >
              <LogOut size={16} className="shrink-0" />
              {!isRailCollapsed && <span className="ml-2.5 text-12 font-medium">Sign Out</span>}
            </button>
          </div>

        </div>
      </aside>

      {/* 2. MAIN CONTAINER WITH TOP BAR & DYNAMIC INNER STAGE */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {/* TOP BAR: ACTIVE-SESSION RISK STRIP & TAGLINE */}
        <header className="h-16 bg-surface border-b border-border px-6 flex items-center justify-between gap-8 shrink-0 z-10">
          <div className="flex items-center gap-6 text-12 font-mono">
            <div className="flex flex-col items-center">
              <span className="text-text-muted">SESSION LIMIT</span>
              <span className="text-text-primary font-semibold">₹{session.sessionLimit.toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-text-muted">DAY LIMIT</span>
              <span className="text-text-primary font-semibold">₹{session.dayLimit.toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-text-muted">WEEK LIMIT</span>
              <span className="text-text-primary font-semibold">₹{session.weekLimit.toFixed(2)}</span>
            </div>
          </div>

          <span className="text-12 text-text-muted italic tracking-tight shrink-0 hidden md:inline">
            Build your edge. Protect your bankroll. Master your process.
          </span>
        </header>

        {/* 3. STAGE CONTENT: DYNAMIC PLACEHOLDERS */}
        <main className="flex-1 overflow-y-auto p-12">
          
          <div className="max-w-4xl mx-auto flex flex-col gap-8 animate-fade-in">
            {/* Route Header Info Card */}
            <div className="flex flex-col gap-1 border-b border-border pb-6">
              <span className="text-12 font-mono uppercase tracking-widest text-accent-steel font-medium">
                Player Lens / {activeTab}
              </span>
              <h1 className="font-display text-40 font-medium tracking-tight text-text-primary capitalize">
                {activeTab === 'play' ? 'Play: Session Contract' : activeTab === 'plan' ? 'Plan: Weekly Game Plan' : activeTab}
              </h1>
              <p className="text-16 text-text-muted mt-1 leading-relaxed">
                {activeTab === 'dashboard' && 'Holistic execution metrics, process scoring, and historical outcomes.'}
                {activeTab === 'prepare' && 'Pre-game mindset preparation, emotional baseline assessment, and checklist execution.'}
                {activeTab === 'plan' && 'Strategize the weekly focus, priority leaks, and theoretical frameworks to implement.'}
                {activeTab === 'play' && 'Commit to execution contracts, track real-time stop-loss consumption, and log discipline deviations.'}
                {activeTab === 'log' && 'The historical ledger of past playing sessions, outcomes, and mental notes.'}
                {activeTab === 'progress' && 'Behavioral profiles, discipline ratings, trend directions, and tactical growth indicators.'}
                {activeTab === 'verdicts' && 'Decisions, interventions, and critiques assigned directly by your coach.'}
                {activeTab === 'interventions' && 'Coach-assigned interventions — read what\'s expected and mark them complete with a note for your coach.'}
              </p>
            </div>

            {/* DYNAMIC HIGH-FIDELITY PLACEHOLDERS */}
            {activeTab === 'dashboard' && <PlayerDashboard userId={userId} onStartPreparation={() => setActiveTab('prepare')} />}

            {activeTab === 'prepare' && (
              <div className="flex flex-col gap-6">
                <PreparationView
                  userId={userId}
                  defaultStopLoss={session.sessionLimit}
                  onGoToTournamentSelection={() => setActiveTab('play')}
                />

                              </div>
            )}

            {activeTab === 'plan' && <WeeklyGamePlanView userId={userId} />}

            {activeTab === 'play' && (
              <>
                {session.status === 'ACTIVE' && session.id && (
                  <TournamentLog sessionId={session.id} onEndSession={handleEndSessionClicked} />
                )}
                {session.status === 'REVIEW_PENDING' && session.id && (
                  <SessionReview sessionId={session.id} playerId={userId} onComplete={handleReviewComplete} onGoBackToEdit={handleGoBackToEdit} />
                )}
                {(session.status === 'NONE' || session.status === 'FINALIZED') && (
                  <SessionContractView
                    userId={userId}
                    onSessionStarted={handleSessionStarted}
                    onGoToPrepare={() => setActiveTab('prepare')}
                  />
                )}
              </>
            )}

            {activeTab === 'log' && <SessionLog userId={userId} />}

            {activeTab === 'progress' && <BehavioralProfileView userId={userId} />}

            {activeTab === 'verdicts' && <VerdictsView userId={userId} />}

            {activeTab === 'interventions' && (
              <PlayerInterventionsView userId={userId} onAssignmentsChanged={() => setInterventionRefreshKey((k) => k + 1)} />
            )}

            {/* General Placeholder Warning info bar */}
            <div className="bg-surface-raised border border-border p-4 rounded-[6px] flex items-center gap-3">
              <CheckCircle size={16} className="text-accent-steel shrink-0" />
              <p className="text-12 text-text-muted">
                This is a fully compliant Navigation Shell interface representing the active Player Lens. All numbers are tab-spaced, money is formatted neutrally, and actions are live.
              </p>
            </div>

          </div>

        </main>
      </div>
    </div>
  );
}
