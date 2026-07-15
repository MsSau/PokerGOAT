import React, { useState, useEffect } from 'react';
import { UserRole, PerformanceFramework, FrameworkVersion } from '../types';
import { getActiveFramework, resolveCoachId } from '../lib/supabase';
import { Lock, ShieldCheck, Sparkles, Calendar, BookOpen, Layers } from 'lucide-react';

interface ActiveFrameworkViewProps {
  userId: string;
  role: UserRole;
}

export default function ActiveFrameworkView({ userId, role }: ActiveFrameworkViewProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    framework: PerformanceFramework;
    version: FrameworkVersion;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const fetchFramework = async () => {
      setLoading(true);
      const coachId = await resolveCoachId(userId, role);
      const result = await getActiveFramework(coachId);
      if (active) {
        setData(result);
        setLoading(false);
      }
    };

    fetchFramework();
    return () => {
      active = false;
    };
  }, [userId, role]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
        <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin"></span>
        <span className="text-12 font-mono text-text-muted mt-3">Loading active framework from database...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center bg-surface border border-border rounded-[6px]">
        <span className="text-14 text-text-muted">No active performance framework resolved.</span>
      </div>
    );
  }

  const { framework, version } = data;

  return (
    <div className="bg-surface border border-border rounded-[6px] flex flex-col overflow-hidden animate-fade-in font-sans">
      
      {/* Read-Only Padlock Banner */}
      <div className="bg-surface-raised/80 border-b border-border px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-ink border border-border flex items-center justify-center text-text-muted">
            <Lock size={15} />
          </div>
          <div className="flex flex-col">
            <span className="text-12 font-mono text-text-muted uppercase tracking-wider">
              PROTOCOL HARD SECURITY
            </span>
            <span className="text-14 font-medium text-text-primary">
              Active Performance Framework is Read-Only
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-ink border border-border px-3 py-1 rounded-[999px]">
          <ShieldCheck size={13} className="text-signal-process" />
          <span className="text-10 font-mono text-text-muted uppercase">Verified protocol v{version.version_number}</span>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-6">
        
        {/* Core Metadata Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-ink/40 border border-border p-4 rounded-[6px] flex flex-col gap-1">
            <span className="text-12 font-mono text-text-muted uppercase flex items-center gap-1.5">
              <Layers size={12} className="text-text-muted" /> FRAMEWORK ID
            </span>
            <span className="text-14 font-mono font-medium text-text-primary select-all">
              {framework.id}
            </span>
          </div>

          <div className="bg-ink/40 border border-border p-4 rounded-[6px] flex flex-col gap-1">
            <span className="text-12 font-mono text-text-muted uppercase flex items-center gap-1.5">
              <Sparkles size={12} className="text-text-muted" /> VERSION
            </span>
            <span className="text-14 font-mono font-medium text-text-primary">
              v{version.version_number}.0.0
            </span>
          </div>

          <div className="bg-ink/40 border border-border p-4 rounded-[6px] flex flex-col gap-1">
            <span className="text-12 font-mono text-text-muted uppercase flex items-center gap-1.5">
              <Calendar size={12} className="text-text-muted" /> PROTOCOL PERIOD
            </span>
            <span className="text-14 font-mono font-medium text-text-primary">
              {version.start_date} <span className="text-text-faint">→</span> {version.end_date}
            </span>
          </div>
        </div>

        {/* Primary Objective - styled beautifully but strictly with desaturated borders */}
        <div className="flex flex-col gap-2.5">
          <label className="text-12 font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen size={12} className="text-text-muted" /> PRIMARY EXECUTION OBJECTIVE
          </label>
          <div className="bg-ink/30 border border-border/80 p-5 rounded-[6px] relative overflow-hidden">
            <div className="absolute right-0 top-0 w-24 h-24 bg-text-faint/5 rounded-full blur-2xl pointer-events-none" />
            <p className="text-14 text-text-primary leading-relaxed whitespace-pre-wrap font-sans font-medium">
              {version.primary_objective}
            </p>
          </div>
        </div>

        {/* Supporting Guidelines check items */}
        <div className="flex flex-col gap-3">
          <span className="text-12 font-mono text-text-muted uppercase tracking-wider">
            MANDATED PREPARATION PROTOCOLS
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 bg-surface-raised border border-border rounded-[4px] flex gap-3">
              <div className="w-5 h-5 rounded-full bg-accent-steel/15 flex items-center justify-center shrink-0 border border-accent-steel/30 text-accent-steel text-11 font-mono">
                1
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-13 font-semibold text-text-primary">Sleep & Physiological Check</span>
                <span className="text-12 text-text-muted">Player cannot boot session without minimum 6.5 hours of tracked rest.</span>
              </div>
            </div>

            <div className="p-4 bg-surface-raised border border-border rounded-[4px] flex gap-3">
              <div className="w-5 h-5 rounded-full bg-accent-steel/15 flex items-center justify-center shrink-0 border border-accent-steel/30 text-accent-steel text-11 font-mono">
                2
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-13 font-semibold text-text-primary">Big Blind Range Review</span>
                <span className="text-12 text-text-muted">Mandatory 10-minute review of BB calling and 3-bet ranges prior to launch.</span>
              </div>
            </div>

            <div className="p-4 bg-surface-raised border border-border rounded-[4px] flex gap-3">
              <div className="w-5 h-5 rounded-full bg-accent-steel/15 flex items-center justify-center shrink-0 border border-accent-steel/30 text-accent-steel text-11 font-mono">
                3
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-13 font-semibold text-text-primary">Breach Auto-Stop Trigger</span>
                <span className="text-12 text-text-muted">Immediate session shutdown upon loss of 2 full buy-ins or $500 total exposure.</span>
              </div>
            </div>

            <div className="p-4 bg-surface-raised border border-border rounded-[4px] flex gap-3">
              <div className="w-5 h-5 rounded-full bg-accent-steel/15 flex items-center justify-center shrink-0 border border-accent-steel/30 text-accent-steel text-11 font-mono">
                4
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-13 font-semibold text-text-primary">Active Tactical Leak Tag</span>
                <span className="text-12 text-text-muted">Tagging hands with "SB-Def" when calling aggressive button ranges.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Non-interaction / Locked notice */}
        <div className="bg-ink/50 border border-border p-4 rounded-[6px] flex items-start gap-3">
          <Lock size={14} className="text-text-muted shrink-0 mt-0.5" />
          <p className="text-12 text-text-muted leading-relaxed">
            The Performance Framework represents a binding process contract. The elements above are assigned globally by your coach and synchronized to your physical play workspace. They cannot be modified client-side.
          </p>
        </div>

      </div>

    </div>
  );
}
