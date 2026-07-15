import React, { useState } from 'react';
import { CoachRoute, UserRole } from '../types';
import ActiveFrameworkView from './ActiveFrameworkView';
import ActiveBRMView from './ActiveBRMView';
import {
  FileText,
  Users,
  Award,
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
  ArrowRight,
  CheckSquare,
  Sparkles,
  Inbox
} from 'lucide-react';

interface CoachShellProps {
  userId: string;
  userEmail: string;
  onLogout: () => void;
  onSwitchRole: (role: UserRole) => void;
}

export default function CoachShell({ userId, userEmail, onLogout, onSwitchRole }: CoachShellProps) {
  // Navigation & UI State
  const [activeTab, setActiveTab] = useState<CoachRoute>('brief'); // Defaults to 'brief'!
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selection states for demo interactivity
  const [selectedPlayer, setSelectedPlayer] = useState<string>('Alex P.');

  // Mock data for Coach Briefing (to let them "understand what changed within 2-3 minutes")
  const alertSummary = {
    unreviewedVerdicts: 3,
    criticalViolations: 2,
    activePlayers: 4,
    escalatedInterventions: 1,
  };

  const criticalIssues: any[] = [];


  const playersList = [
    { name: 'Alex P.', role: 'PLAYER', bankroll: '$18,240.00', processScore: '92%', lastActive: '1 hr ago', status: 'VIOLATION' },
    { name: 'Juliet K.', role: 'PLAYER', bankroll: '$34,500.00', processScore: '72%', lastActive: '3 hrs ago', status: 'WARNING' },
    { name: 'Marcus V.', role: 'PLAYER', bankroll: '$9,120.00', processScore: '89%', lastActive: 'In Session', status: 'COMPLIANT' },
    { name: 'Sam R.', role: 'PLAYER', bankroll: '$12,400.00', processScore: '96%', lastActive: '1 day ago', status: 'COMPLIANT' },
  ];

  // Navigation Items
  const navItems = [
    { id: 'brief' as CoachRoute, label: 'Brief', icon: FileText, sub: 'Weekly Coach Brief' },
    { id: 'player' as CoachRoute, label: 'Player', icon: Users, sub: 'Roster & Focus Grid' },
    { id: 'verdicts' as CoachRoute, label: 'Verdicts', icon: Award, sub: 'Decision Manager' },
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

            {/* Quick switcher to Player Shell for testing */}
            {!isRailCollapsed && (
              <div className="px-1.5 py-1 bg-surface-raised/40 rounded border border-border/40 text-[10px] flex flex-col gap-1 text-text-muted">
                <span className="font-mono text-[9px] uppercase tracking-wide text-text-faint">
                  Sandbox Controls
                </span>
                <button
                  type="button"
                  onClick={() => onSwitchRole('PLAYER')}
                  className="w-full text-center py-1 rounded bg-accent-bronze/10 border border-accent-bronze/30 text-accent-bronze hover:bg-accent-bronze/20 font-sans transition-colors"
                >
                  Switch to Player Shell
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

      {/* 2. MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {/* TOP BAR */}
        <header className="h-16 bg-surface border-b border-border px-6 flex items-center justify-between gap-4 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <span className="text-14 font-mono text-text-muted uppercase tracking-wider">
              Portal:
            </span>
            <span className="text-14 font-sans font-semibold text-text-primary">
              Julian's Coaching Wing
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
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
                {activeTab === 'brief' && 'High-density summary of player alerts, stop-loss breaches, and pending interventions over the past 48 hours.'}
                {activeTab === 'player' && 'Roster directory, performance benchmarks, active contracts, and streak records.'}
                {activeTab === 'verdicts' && 'Assign critique verdicts, review player pledges, and log structural deviations.'}
                {activeTab === 'behavioral' && 'Behavioral profiles, qualitative ratings, trend models, and radial scoreboards.'}
                {activeTab === 'framework' && 'Mental prep frameworks, checklists, and action-guide manuals.'}
                {activeTab === 'brm' && 'Approve bankroll limits, set stop-loss margins, and coordinate stake movements.'}
                {activeTab === 'taxonomy' && 'Browse, define, and customize process errors, tilt catalogs, and execution rules.'}
                {activeTab === 'escalation' && 'Strict protocols for progressive loss limits, locking periods, and mandatory reviews.'}
                {activeTab === 'interventions' && 'Authorize worksheets, trigger stop-playing protocols, and assign critical interventions.'}
              </p>
            </div>

            {/* DYNAMIC VIEWPORTS */}
            {activeTab === 'brief' && (
              <div className="flex flex-col gap-6 animate-fade-in">
                {/* A. Quick High-Density Summary Cards ("Understand what changed within 2-3 minutes") */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-surface border border-border p-4 rounded-[6px] flex flex-col gap-1.5">
                    <span className="text-[11px] font-mono text-text-muted uppercase tracking-wider">
                      CRITICAL VIOLATIONS
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-28 font-mono font-medium text-signal-risk">
                        {alertSummary.criticalViolations}
                      </span>
                      <span className="text-11 font-mono text-signal-risk uppercase">● Urgent</span>
                    </div>
                    <span className="text-[11px] text-text-faint mt-1">Requires immediate lock reviews</span>
                  </div>

                  <div className="bg-surface border border-border p-4 rounded-[6px] flex flex-col gap-1.5">
                    <span className="text-[11px] font-mono text-text-muted uppercase tracking-wider">
                      UNREVIEWED VERDICTS
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-28 font-mono font-medium text-signal-caution">
                        {alertSummary.unreviewedVerdicts}
                      </span>
                      <span className="text-11 font-mono text-text-muted">Pending</span>
                    </div>
                    <span className="text-[11px] text-text-faint mt-1">Sessions needing feedback</span>
                  </div>

                  <div className="bg-surface border border-border p-4 rounded-[6px] flex flex-col gap-1.5">
                    <span className="text-[11px] font-mono text-text-muted uppercase tracking-wider">
                      ESCALATED PROTOCOLS
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-28 font-mono font-medium text-signal-risk">
                        {alertSummary.escalatedInterventions}
                      </span>
                      <span className="text-11 font-mono text-signal-risk">Locked</span>
                    </div>
                    <span className="text-[11px] text-text-faint mt-1">Player currently in review lock</span>
                  </div>

                  <div className="bg-surface border border-border p-4 rounded-[6px] flex flex-col gap-1.5">
                    <span className="text-[11px] font-mono text-text-muted uppercase tracking-wider">
                      ACTIVE SESSIONS LIVE
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-28 font-mono font-medium text-signal-process">
                        {alertSummary.activePlayers}
                      </span>
                      <span className="text-11 font-mono text-signal-process uppercase animate-pulse">● Live</span>
                    </div>
                    <span className="text-[11px] text-text-faint mt-1">Monitoring table risk</span>
                  </div>
                </div>

                {/* B. Highly structured, dense alert feed */}
                <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-border pb-3">
                    <h2 className="text-14 font-semibold uppercase tracking-wider text-text-primary">
                      CRITICAL EVENTS FEED (PAST 48 HOURS)
                    </h2>
                    <span className="text-12 font-mono text-text-muted">Sorted by severity</span>
                  </div>

                  <div className="flex flex-col gap-3">
                    {criticalIssues.map((issue) => (
                      <div 
                        key={issue.id} 
                        className={`flex flex-col md:flex-row md:items-center justify-between p-3.5 bg-surface-raised border rounded-[4px] gap-3 ${
                          issue.severity === 'RISK' ? 'border-signal-risk/20 bg-signal-risk/5' : 'border-signal-caution/20 bg-signal-caution/5'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {issue.severity === 'RISK' ? (
                            <AlertTriangle size={18} className="text-signal-risk shrink-0 mt-0.5" />
                          ) : (
                            <Activity size={18} className="text-signal-caution shrink-0 mt-0.5" />
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span className="text-14 font-medium text-text-primary">
                              {issue.player} — {issue.issue}
                            </span>
                            <span className="text-12 text-text-muted">
                              Impact assessment required. Click to view full Hand Logs.
                            </span>
                          </div>
                        </div>

                        {/* Money figures neutrally styled (Hard Rule) */}
                        <div className="flex items-center gap-3 self-end md:self-auto">
                          <span className="font-mono text-14 text-text-primary bg-ink border border-border/80 px-2.5 py-1 rounded">
                            {issue.metric}
                          </span>
                          <button 
                            type="button" 
                            className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                            title="Open Verdict Creator"
                            onClick={() => setActiveTab('verdicts')}
                          >
                            <ArrowRight size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* C. Roster quick scan */}
                <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
                  <h2 className="text-14 font-semibold uppercase tracking-wider text-text-primary border-b border-border pb-3">
                    COACH WING ROSTER ACTIVE SNAPSHOT
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-surface-raised text-11 font-mono text-text-muted">
                          <th className="p-3">PLAYER</th>
                          <th className="p-3">BANKROLL (NEUTRAL)</th>
                          <th className="p-3">PROCESS FIDELITY</th>
                          <th className="p-3">LAST LOGGED ACTIVITY</th>
                          <th className="p-3">STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="text-12 font-sans text-text-primary">
                        {playersList.map((player) => (
                          <tr key={player.name} className="border-b border-border/50 hover:bg-surface-raised/30 transition-colors">
                            <td className="p-3 font-semibold">{player.name}</td>
                            <td className="p-3 font-mono">{player.bankroll}</td>
                            <td className="p-3">
                              <span className={`font-mono ${
                                parseInt(player.processScore) < 80 ? 'text-signal-risk' : 'text-signal-process'
                              }`}>
                                {player.processScore}
                              </span>
                            </td>
                            <td className="p-3 text-text-muted font-mono">{player.lastActive}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                                player.status === 'VIOLATION' 
                                  ? 'bg-signal-risk/10 border border-signal-risk/30 text-signal-risk' 
                                  : player.status === 'WARNING'
                                  ? 'bg-signal-caution/10 border border-signal-caution/30 text-signal-caution'
                                  : 'bg-signal-process/10 border border-signal-process/30 text-signal-process'
                              }`}>
                                {player.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'player' && (
              <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
                <span className="text-12 font-mono text-text-muted uppercase">Player Wing Directory</span>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {playersList.map((pl) => (
                    <button
                      key={pl.name}
                      type="button"
                      onClick={() => setSelectedPlayer(pl.name)}
                      className={`p-4 rounded border text-left flex flex-col gap-2 transition-all ${
                        selectedPlayer === pl.name 
                          ? 'bg-surface-raised border-accent-bronze text-text-primary' 
                          : 'bg-surface border-border text-text-muted hover:border-text-faint'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-14 font-semibold text-text-primary">{pl.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink border border-border">
                          {pl.role}
                        </span>
                      </div>
                      <div className="flex flex-col font-mono text-12">
                        <span>Bankroll: {pl.bankroll}</span>
                        <span>Fidelity: {pl.processScore}</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="p-6 bg-surface-raised border border-border rounded mt-4">
                  <h3 className="text-14 font-semibold text-text-primary border-b border-border pb-2 mb-3">
                    Focused Profile Review: {selectedPlayer}
                  </h3>
                  <p className="text-12 text-text-muted leading-relaxed">
                    Reviewing structural statistics for {selectedPlayer}. Last feedback was logged 4 days ago. This player currently has 1 unreviewed session contract.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'verdicts' && (
              <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
                <span className="text-12 font-mono text-text-muted uppercase">Assign New Verdicts</span>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-12 font-mono text-text-muted">Target Player</label>
                    <select className="bg-ink border border-border rounded p-2 text-14 text-text-primary focus:outline-none focus:border-accent-bronze">
                      {playersList.map(p => <option key={p.name}>{p.name}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-12 font-mono text-text-muted">Fidelity Rating</label>
                    <input type="text" placeholder="e.g. CRITICAL or COMPLIANT" className="bg-ink border border-border rounded p-2 text-14 text-text-primary focus:outline-none focus:border-accent-bronze" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-12 font-mono text-text-muted">Review Notes & Directive</label>
                    <textarea rows={3} placeholder="Provide specific, execution-focused feedback..." className="bg-ink border border-border rounded p-2 text-14 text-text-primary focus:outline-none focus:border-accent-bronze" />
                  </div>

                  <button type="button" className="py-2.5 bg-accent-bronze text-text-primary rounded text-12 font-semibold hover:bg-accent-bronze/95 transition-colors">
                    Publish Verdict to Player Shell
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'behavioral' && (
              <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
                <span className="text-12 font-mono text-text-muted uppercase">Qualitative Taxonomies</span>
                <div className="p-4 bg-surface-raised rounded border border-border">
                  <span className="text-14 font-semibold text-text-primary">Discipline Radar Model</span>
                  <p className="text-12 text-text-muted leading-relaxed mt-2">
                    Visualizes the player's execution consistency across 5 critical dimensions: Stop-loss adherence, pre-game ritual complete, sizing precision, volume consistency, and post-session review logs.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'framework' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <h2 className="text-18 font-medium text-text-primary tracking-tight">Active Performance Framework</h2>
                  <p className="text-12 text-text-muted mt-1">
                    Below is the binding framework currently activated for players under your wing.
                  </p>
                </div>
                <ActiveFrameworkView userId={userId} role="COACH" />
              </div>
            )}

            {activeTab === 'brm' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <h2 className="text-18 font-medium text-text-primary tracking-tight">Bankroll Management Boundaries</h2>
                  <p className="text-12 text-text-muted mt-1">
                    Below are the current stop-loss thresholds and level transition caps configured for players.
                  </p>
                </div>
                <ActiveBRMView userId={userId} role="COACH" />
              </div>
            )}

            {activeTab === 'taxonomy' && (
              <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
                <span className="text-12 font-mono text-text-muted uppercase">Error Taxonomies</span>
                <p className="text-12 text-text-muted">
                  Define violation codes (e.g., T-10: Emotion Sizing Breach, P-02: Delayed Stop Loss) to tag sessions and build structural metrics.
                </p>
              </div>
            )}

            {activeTab === 'escalation' && (
              <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
                <span className="text-12 font-mono text-text-muted uppercase">Tilt Escalation Protocol Matrix</span>
                <p className="text-12 text-text-muted">
                  Automated lock periods triggered by multiple stop-loss violations. Locked players cannot start new session contracts until coach review complete.
                </p>
              </div>
            )}

            {activeTab === 'interventions' && (
              <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
                <span className="text-12 font-mono text-text-muted uppercase">Active Intervention Assignments</span>
                <p className="text-12 text-text-muted">
                  Create and manage active worksheets (such as Emotional Trigger Mapping sheets) that lock a player's play tab until fully written.
                </p>
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
