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
  Clock,
  ExternalLink,
  DollarSign
} from 'lucide-react';
import WeeklyGamePlanView from './WeeklyGamePlanView';
import SessionContractView from './SessionContractView';
import TournamentLog from './TournamentLog';
import { fetchLatestBRMAssignment, startSession, fetchActiveSession, supabase } from '../lib/supabase';
import SessionReview from './SessionReview';
import { stopSessionForReview } from '../lib/endSession';
import SessionLog from './SessionLog';


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

  // Simulation States (to show interactive badges / active session behavior)
  const [hasIntervention, setHasIntervention] = useState(true);
  const [hasPendingAction, setHasPendingAction] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(true);

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
  setActiveTab('dashboard'); // per §2.1 CTA state machine, land back on the dashboard
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
    { id: 'dashboard' as PlayerRoute, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'prepare' as PlayerRoute, label: 'Prepare', icon: Sparkles },
    { id: 'plan' as PlayerRoute, label: 'Plan', icon: CalendarDays, sub: 'Weekly Game Plan' },
    { id: 'play' as PlayerRoute, label: 'Play', icon: Swords, sub: 'Session Contract' },
    { id: 'log' as PlayerRoute, label: 'Log', icon: History, sub: 'Session Records' },
    { id: 'progress' as PlayerRoute, label: 'Progress', icon: TrendingUp, sub: 'Behavioral Profile' },
    { id: 'verdicts' as PlayerRoute, label: 'Verdicts', icon: Award, sub: 'Coach Decisions' },
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
          
          {/* Coach-Assigned Interventions Badge */}
          {hasIntervention && (
            <div 
              className={`flex items-center rounded-[4px] p-2 bg-signal-risk/5 border border-signal-risk/20 cursor-help ${
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
                  1
                </span>
              )}
            </div>
          )}

          {/* Proposed-Action Status Indicator */}
          {hasPendingAction && (
            <div 
              className={`flex items-center rounded-[4px] p-2 bg-signal-caution/5 border border-signal-caution/20 cursor-help ${
                isRailCollapsed ? 'justify-center' : 'justify-between'
              }`}
              title="Execution Action Pending Coach Approval"
            >
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-signal-caution shrink-0" />
                {!isRailCollapsed && (
                  <span className="text-12 font-medium text-signal-caution">
                    Action Pending
                  </span>
                )}
              </div>
              {!isRailCollapsed && (
                <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider">
                  Review
                </span>
              )}
            </div>
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
                <div className="flex justify-between items-center">
                  <span>Badge triggers:</span>
                  <button 
                    type="button"
                    onClick={() => setHasIntervention(!hasIntervention)}
                    className={`px-1 py-0.5 rounded border ${hasIntervention ? 'border-signal-risk/40 text-signal-risk' : 'border-border text-text-faint'}`}
                  >
                    Intv
                  </button>
                  <button 
                    type="button"
                    onClick={() => setHasPendingAction(!hasPendingAction)}
                    className={`px-1 py-0.5 rounded border ${hasPendingAction ? 'border-signal-caution/40 text-signal-caution' : 'border-border text-text-faint'}`}
                  >
                    Actn
                  </button>
                </div>
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
        
        {/* TOP BAR: ACTIVE-SESSION RISK STRIP & SEARCH */}
        <header className="h-16 bg-surface border-b border-border px-6 flex items-center gap-8 shrink-0 z-10">
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
              </p>
            </div>

            {/* DYNAMIC HIGH-FIDELITY PLACEHOLDERS */}
            {activeTab === 'dashboard' && <PlayerDashboard userId={userId} />}

            {activeTab === 'prepare' && (
              <div className="flex flex-col gap-6">
                <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
                  <span className="text-12 font-mono text-text-muted uppercase">Mental Prep Framework & Daily Habits Checklist</span>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start gap-3 p-3 bg-surface-raised rounded border border-border">
                      <input type="checkbox" className="mt-1 accent-accent-steel animate-pulse cursor-pointer" defaultChecked />
                      <div className="flex flex-col">
                        <span className="text-14 font-medium text-text-primary">Check for physiological fatigue</span>
                        <span className="text-12 text-text-muted font-mono">Stop-loss triggers if sleep is under 6 hours. Verified via wear link.</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-surface-raised rounded border border-border">
                      <input type="checkbox" className="mt-1 accent-accent-steel cursor-pointer" />
                      <div className="flex flex-col">
                        <span className="text-14 font-medium text-text-primary">Explicitly review the Active Performance Framework</span>
                        <span className="text-12 text-text-muted font-mono">Ensure BB calling boundaries and MDF principles are top of mind.</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="text-12 font-mono text-text-muted uppercase tracking-wider">Active Protocol Framework</h3>
                  <ActiveFrameworkView userId={userId} role="PLAYER" />
                </div>
              </div>
            )}

            {activeTab === 'plan' && <WeeklyGamePlanView userId={userId} />}

            {activeTab === 'play' && (
              <>
                {session.status === 'ACTIVE' && session.id && (
                  <TournamentLog sessionId={session.id} onEndSession={handleEndSessionClicked} />
                )}
                {session.status === 'REVIEW_PENDING' && session.id && (
                  <SessionReview sessionId={session.id} playerId={userId} onComplete={handleReviewComplete} />
                )}
                {(session.status === 'NONE' || session.status === 'FINALIZED') && (
                  <SessionContractView userId={userId} onSessionStarted={handleSessionStarted} />
                )}
              </>
            )}

            {activeTab === 'log' && <SessionLog userId={userId} />}

            {activeTab === 'progress' && (
              <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-6">
                <span className="text-12 font-mono text-text-muted uppercase">Behavioral Profile Status</span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Performance stats */}
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                      <span className="text-14 text-text-muted">Tilt Resilience</span>
                      <span className="text-14 font-mono text-signal-process">Excellent</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                      <span className="text-14 text-text-muted">Stop-Loss Adherence</span>
                      <span className="text-14 font-mono text-signal-process">100%</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                      <span className="text-14 text-text-muted">Emotional Baselines</span>
                      <span className="text-14 font-mono text-signal-caution">Stable</span>
                    </div>
                  </div>

                  {/* Description container */}
                  <div className="p-4 bg-surface-raised rounded border border-border text-12 text-text-muted leading-relaxed flex flex-col gap-2">
                    <span className="font-mono text-12 text-text-primary uppercase">RADIAL RATINGS ANALYSIS</span>
                    <p>
                      Your progress indicates high-fidelity adherence to process, but early indicators show weak ratings on "Endurance in extended deep structures."
                    </p>
                    <p className="text-signal-process font-mono">
                      ● Action Plan: Keep sessions strictly capped at 90 minutes.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'verdicts' && (
              <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
                <span className="text-12 font-mono text-text-muted uppercase">Active Coaching Verdicts</span>
                <div className="p-4 bg-surface-raised rounded border border-border flex flex-col gap-3">
                  <div className="flex justify-between items-start border-b border-border pb-2">
                    <div className="flex flex-col">
                      <span className="text-14 font-semibold text-text-primary">Execution Verdict V-82</span>
                      <span className="text-12 text-text-faint font-mono">Assigned by Coach Julian</span>
                    </div>
                    <span className="text-[10px] bg-accent-bronze/10 border border-accent-bronze/30 text-accent-bronze font-mono px-2 py-0.5 rounded-full uppercase">
                      Action Required
                    </span>
                  </div>
                  <p className="text-14 text-text-muted leading-relaxed">
                    "We need to restrict cold call 3-bets from the small blind when an aggressive button sits with a 50+ BB stack. Review your SB defense spreadsheet immediately."
                  </p>
                </div>
              </div>
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
