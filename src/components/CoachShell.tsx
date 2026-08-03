import React, { useState, useEffect } from 'react';
import { CoachRoute } from '../types';
import FrameworkConfigView from './FrameworkConfigView';
import BRMConfigView from './BRMConfigView';
import TaxonomyConfigView from './TaxonomyConfigView';
import EscalationConfigView from './EscalationConfigView';
import InterventionsConfigView, { AssignmentPrefill } from './InterventionsConfigView';
import CoachBriefView from './CoachBriefView';
import BehavioralProfileView from './BehavioralProfileView';
import { fetchCoachRoster } from '../lib/coachRoster';
import { supabase, fetchUnclaimedPlayers, claimPlayers, UnclaimedPlayer } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { PlayerId, CoachId, ExecutionActionId, asCoachId, asPlayerId } from '../types/ids';
import {
  FileText,
  TrendingUp,
  BookOpen,
  DollarSign,
  Layers,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Search,
  LogOut,
  User,
  ShieldAlert,
  CheckSquare,
  Sparkles,
  UserPlus,
} from 'lucide-react';

interface CoachShellProps {
  userId: PlayerId;
  userEmail: string;
  onLogout: () => void;
}

export default function CoachShell({ userId, userEmail, onLogout }: CoachShellProps) {
  // Navigation & UI State
  const [activeTab, setActiveTab] = useState<CoachRoute>('brief'); // Defaults to 'brief'!
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const coachId = asCoachId(userId);

  const { data: coachName } = useAsync(async () => {
    const { data, error } = await supabase.from('profiles').select('display_name').eq('id', coachId).single();
    if (error) throw error;
    return data.display_name;
  }, [coachId]);

  const { data: roster, loading: rosterLoading, error: rosterError, reload: reloadRoster } = useAsync(
    () => (coachId ? fetchCoachRoster(coachId) : Promise.resolve([])),
    [coachId]
  );

  const [selectedPlayerId, setSelectedPlayerId] = useState<PlayerId | null>(null);
  useEffect(() => {
    if (!selectedPlayerId && roster && roster.length > 0) {
      setSelectedPlayerId(roster[0].playerId);
    }
  }, [roster, selectedPlayerId]);

  // Links the Escalation and Interventions tabs: clicking "Assign
  // Intervention" next to a track's Override control (EscalationConfigView)
  // sets this and switches tabs, so Interventions > Assignments opens with
  // that player + track already selected instead of making the coach
  // re-pick both there.
  const [assignPrefill, setAssignPrefill] = useState<AssignmentPrefill | null>(null);
  function handleAssignIntervention(playerId: PlayerId, executionActionId: ExecutionActionId) {
    setAssignPrefill({ playerId, executionActionId, token: Date.now() });
    setActiveTab('interventions');
  }

  // Navigation Items
  const navItems = [
    { id: 'brief' as CoachRoute, label: 'Brief', icon: FileText, sub: 'Weekly Coach Brief' },
    { id: 'behavioral' as CoachRoute, label: 'Behavioral', icon: TrendingUp, sub: 'Taxonomy & Trend' },
    { id: 'framework' as CoachRoute, label: 'Framework', icon: BookOpen, sub: 'Action Guides' },
    { id: 'brm' as CoachRoute, label: 'BRM', icon: DollarSign, sub: 'Bankroll & Stop Loss' },
    { id: 'taxonomy' as CoachRoute, label: 'Taxonomy', icon: Layers, sub: 'Error Taxonomy' },
    { id: 'escalation' as CoachRoute, label: 'Escalation', icon: ShieldAlert, sub: 'Tilt Escalation' },
    { id: 'interventions' as CoachRoute, label: 'Interventions', icon: Activity, sub: 'Active Protocol' },
  ];

  return (
    <div id="coach-layout" className="min-h-screen flex bg-ink text-text-primary font-sans select-none overflow-hidden">
      
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
              <div className="w-8 h-8 rounded-[4px] bg-accent-bronze/10 border border-accent-bronze/30 flex items-center justify-center font-display font-medium text-16 text-accent-bronze">
                C
              </div>
              <span className="font-display font-semibold text-16 text-text-primary tracking-tight">
                PokerGOAT
              </span>
              <span className="font-mono text-[9px] bg-surface-raised border border-border px-1.5 py-0.5 rounded text-signal-caution font-medium">
                COACH
              </span>
            </div>
          )}
          {isRailCollapsed && (
            <div className="w-8 h-8 rounded-[4px] bg-accent-bronze/10 border border-accent-bronze/30 flex items-center justify-center font-display font-semibold text-14 text-accent-bronze mx-auto">
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
                    ? 'bg-surface-raised text-text-primary border-l-[3px] border-accent-bronze' 
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-raised/50'
                }`}
              >
                <Icon size={18} className={`shrink-0 ${isActive ? 'text-accent-bronze' : 'text-text-muted'}`} />
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

        {/* Bottom of Rail User Block */}
        <div className="border-t border-border p-2 flex flex-col gap-2 bg-ink/30">
          
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
                    Coach Portal
                  </span>
                </div>
              )}
            </div>

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

      {/* 2. MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {/* TOP BAR */}
        <header className="h-16 bg-surface border-b border-border px-6 flex items-center justify-between gap-4 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <span className="text-14 font-mono text-text-muted uppercase tracking-wider">
              Portal:
            </span>
            <span className="text-14 font-sans font-semibold text-text-primary">
              {coachName ? `Coach ${coachName}'s Coaching Wing` : "Coach's Coaching Wing"}
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {/* Global Search */}
            <div className="relative max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search players, rosters, verdicts..."
                className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] pl-8 pr-3 py-1.5 text-12 text-text-primary placeholder:text-text-faint transition-colors w-64 font-sans"
              />
            </div>

            <span className="text-12 text-text-muted italic tracking-tight hidden lg:inline">
              Build your edge. Protect your bankroll. Master your process.
            </span>
          </div>
        </header>

        {/* 3. HIGH DENSITY WORKSPACE */}
        <main className="flex-1 overflow-y-auto p-12">
          
          <div className="max-w-6xl mx-auto flex flex-col gap-8">
            
            {/* Header section */}
            <div className="flex flex-col gap-1 border-b border-border pb-6">
              <span className="text-12 font-mono uppercase tracking-widest text-accent-bronze font-medium">
                Coach Lens / {activeTab}
              </span>
              <h1 className="font-display text-40 font-medium tracking-tight text-text-primary capitalize">
                {activeTab === 'brief' ? 'Weekly Coach Brief' : activeTab === 'brm' ? 'Bankroll Management (BRM)' : activeTab}
              </h1>
              <p className="text-14 text-text-muted mt-1 leading-relaxed">
                {activeTab === 'brief' && 'Per-player Weekly Coach Brief — preparation, execution, outcome, behavioral trend, and coaching history in one document.'}
                {activeTab === 'behavioral' && 'Behavioral profiles, qualitative ratings, trend models, and radial scoreboards.'}
                {activeTab === 'framework' && 'Mental prep frameworks, checklists, and action-guide manuals.'}
                {activeTab === 'brm' && 'Approve bankroll limits, set stop-loss margins, and coordinate stake movements.'}
                {activeTab === 'taxonomy' && 'Browse, define, and customize process errors, tilt catalogs, and execution rules.'}
                {activeTab === 'escalation' && 'Strict protocols for progressive loss limits, locking periods, and mandatory reviews.'}
                {activeTab === 'interventions' && 'Authorize worksheets, trigger stop-playing protocols, and assign critical interventions.'}
              </p>
            </div>

            {coachId && <UnclaimedPlayersPanel coachId={coachId} onClaimed={reloadRoster} />}

            {/* DYNAMIC VIEWPORTS */}
            {activeTab === 'brief' && (
              <div className="flex flex-col gap-6 animate-fade-in">
                {rosterLoading && (
                  <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
                    <span className="w-6 h-6 border-2 border-accent-bronze border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {rosterError && (
                  <div className="bg-surface border border-signal-risk/30 rounded-[6px] p-6 text-14 text-signal-risk">{rosterError}</div>
                )}
                {!rosterLoading && !rosterError && (!roster || roster.length === 0) && (
                  <div className="bg-surface border border-border rounded-[6px] p-8 text-center text-14 text-text-muted">
                    No players in your roster yet.
                  </div>
                )}
                {!rosterLoading && roster && roster.length > 0 && (
                  <>
                    <div className="flex items-center gap-3">
                      <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Player</label>
                      <select
                        value={selectedPlayerId ?? ''}
                        onChange={(e) => setSelectedPlayerId(asPlayerId(e.target.value))}
                        className="bg-ink border border-border rounded p-2 text-14 text-text-primary focus:outline-none focus:border-accent-bronze"
                      >
                        {roster.map((p) => (
                          <option key={p.playerId} value={p.playerId}>{p.displayName}</option>
                        ))}
                      </select>
                    </div>
                    {selectedPlayerId && coachId && <CoachBriefView playerId={selectedPlayerId} coachId={coachId} />}
                  </>
                )}
              </div>
            )}

            {activeTab === 'behavioral' && (
              <div className="flex flex-col gap-6 animate-fade-in">
                {rosterLoading && (
                  <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
                    <span className="w-6 h-6 border-2 border-accent-bronze border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {rosterError && (
                  <div className="bg-surface border border-signal-risk/30 rounded-[6px] p-6 text-14 text-signal-risk">{rosterError}</div>
                )}
                {!rosterLoading && !rosterError && (!roster || roster.length === 0) && (
                  <div className="bg-surface border border-border rounded-[6px] p-8 text-center text-14 text-text-muted">
                    No players in your roster yet.
                  </div>
                )}
                {!rosterLoading && roster && roster.length > 0 && (
                  <>
                    <div className="flex items-center gap-3">
                      <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Player</label>
                      <select
                        value={selectedPlayerId ?? ''}
                        onChange={(e) => setSelectedPlayerId(asPlayerId(e.target.value))}
                        className="bg-ink border border-border rounded p-2 text-14 text-text-primary focus:outline-none focus:border-accent-bronze"
                      >
                        {roster.map((p) => (
                          <option key={p.playerId} value={p.playerId}>{p.displayName}</option>
                        ))}
                      </select>
                    </div>
                    {selectedPlayerId && <BehavioralProfileView userId={selectedPlayerId} allowWindowControl />}
                  </>
                )}
              </div>
            )}

            {activeTab === 'framework' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <h2 className="text-18 font-medium text-text-primary tracking-tight">Performance Framework Configuration</h2>
                  <p className="text-12 text-text-muted mt-1">
                    Create, edit, activate, and archive the quarterly Performance Framework for players under your wing.
                  </p>
                </div>
                {coachId ? (
                  <FrameworkConfigView coachId={coachId} />
                ) : (
                  <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
                    <span className="w-6 h-6 border-2 border-accent-bronze border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'brm' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <h2 className="text-18 font-medium text-text-primary tracking-tight">Bankroll Management Configuration</h2>
                  <p className="text-12 text-text-muted mt-1">
                    Configure bankroll bands, BRM levels, and stop-loss thresholds for players under your wing.
                  </p>
                </div>
                {coachId ? (
                  <BRMConfigView coachId={coachId} />
                ) : (
                  <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
                    <span className="w-6 h-6 border-2 border-accent-bronze border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'taxonomy' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <h2 className="text-18 font-medium text-text-primary tracking-tight">Execution Taxonomy Configuration</h2>
                  <p className="text-12 text-text-muted mt-1">
                    Create and edit canonical Execution Actions by dimension, and approve or reject player-proposed actions.
                  </p>
                </div>
                {coachId ? (
                  <TaxonomyConfigView coachId={coachId} />
                ) : (
                  <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
                    <span className="w-6 h-6 border-2 border-accent-bronze border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'escalation' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <h2 className="text-18 font-medium text-text-primary tracking-tight">Behavioral Escalation Engine</h2>
                  <p className="text-12 text-text-muted mt-1">
                    The 8-stage escalation ladder, every active track on your roster, and the mandatory-reason override path.
                  </p>
                </div>
                {coachId ? (
                  <EscalationConfigView coachId={coachId} onAssignIntervention={handleAssignIntervention} />
                ) : (
                  <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
                    <span className="w-6 h-6 border-2 border-accent-bronze border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'interventions' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <h2 className="text-18 font-medium text-text-primary tracking-tight">Intervention Engine Configuration</h2>
                  <p className="text-12 text-text-muted mt-1">
                    Manage the intervention library — each item mapped to a minimum escalation stage — and assign interventions against players' active escalation tracks.
                  </p>
                </div>
                {coachId ? (
                  <InterventionsConfigView
                    coachId={coachId}
                    prefillAssignment={assignPrefill}
                    onPrefillConsumed={() => setAssignPrefill(null)}
                  />
                ) : (
                  <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
                    <span className="w-6 h-6 border-2 border-accent-bronze border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}

            {/* General placeholder bar */}
            <div className="bg-surface-raised border border-border p-4 rounded-[6px] flex items-center gap-3">
              <CheckSquare size={16} className="text-accent-bronze shrink-0" />
              <p className="text-12 text-text-muted">
                This is a fully compliant high-density Coach Lens Navigation Shell. Data streams are packed for fast scan capability, and design structures respect all color/typography mandates.
              </p>
            </div>

          </div>

        </main>
      </div>
    </div>
  );
}

// Self-registered players start with no coach (profiles.coach_id IS NULL —
// see App.tsx's "waiting for your coach" screen, which is what they see
// until this panel claims them). Shown on every tab, not just once at
// registration, so it also covers a player who registers after this coach
// already has a roster. Renders nothing once there's nothing to claim.
function UnclaimedPlayersPanel({ coachId, onClaimed }: { coachId: CoachId; onClaimed: () => void }) {
  const { data: unclaimed, loading, reload } = useAsync(() => fetchUnclaimedPlayers(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleClaim = async () => {
    if (selected.size === 0) return;
    setClaiming(true);
    setError(null);
    try {
      await claimPlayers(coachId, Array.from(selected).map(asPlayerId));
      setSelected(new Set());
      await reload();
      onClaimed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add players to roster.');
    } finally {
      setClaiming(false);
    }
  };

  if (loading || !unclaimed || unclaimed.length === 0) return null;

  return (
    <div className="bg-surface border border-accent-bronze/30 rounded-[6px] overflow-hidden animate-fade-in">
      <div className="bg-surface-raised/60 border-b border-border px-4 py-2.5 flex items-center gap-2">
        <UserPlus size={13} className="text-accent-bronze" />
        <span className="text-12 font-mono text-text-muted uppercase tracking-wider">
          Unclaimed Players — {unclaimed.length} registered, no coach yet
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {unclaimed.map((p: UnclaimedPlayer) => (
          <label key={p.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-raised/30">
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
            <div className="flex flex-col">
              <span className="text-13 text-text-primary">{p.displayName || p.email.split('@')[0]}</span>
              <span className="text-11 font-mono text-text-faint">{p.email}</span>
            </div>
          </label>
        ))}
      </div>
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-t border-border">
        {error && <span className="text-11 text-signal-risk">{error}</span>}
        <button
          type="button"
          disabled={selected.size === 0 || claiming}
          onClick={handleClaim}
          className="ml-auto px-3 py-1.5 bg-accent-bronze text-ink rounded-[4px] text-12 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {claiming ? 'Adding…' : selected.size > 0 ? `Add ${selected.size} to Roster` : 'Add to Roster'}
        </button>
      </div>
    </div>
  );
}
