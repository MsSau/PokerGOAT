// src/lib/weeklyGamePlan.ts
//
// Data-access + deterministic validation for the Weekly Game Plan (PRD §3.5).
// Kept as its own module (not inline in the component, not inside any AI
// prompt) per PRD Section 20's requirement to separate deterministic
// business rules into reusable modules — so a future validate_weekly_game_plan
// Postgres RPC can replace the internals of validateWeeklyGamePlan() without
// any UI changes.

import { supabase } from './supabase';
import { Json } from '../types/database';
import { fetchSlotRulesForBRMLevel, SlotRule } from './brmRules';
import { WeeklyBRMAssignmentRow } from './sessionContract';
import {
  WeeklyGamePlan,
  WeeklyGamePlanPlayingDay,
  WeeklyGamePlanTournament,
  WeeklyGamePlanConditionalTournament,
  WeeklyGamePlanCommitment,
  WeeklyGamePlanAmendment,
  PokerWeek,
  BRMLevel,
  FrameworkVersion,
} from '../types';
import {
  PlayerId, CoachId, PokerWeekId, WeeklyGamePlanId, FrameworkVersionId, BRMAssignmentId,
  asBRMLevelId,
} from '../types/ids';

export interface WGPContext {
  pokerWeek: PokerWeek | null;
  brmAssignment: WeeklyBRMAssignmentRow | null;
  brmLevel: BRMLevel | null;
  frameworkVersion: FrameworkVersion | null;
  slotRules: SlotRule[] | null;
}

export interface WGPFull {
  plan: WeeklyGamePlan;
  playingDays: WeeklyGamePlanPlayingDay[];
  tournaments: WeeklyGamePlanTournament[];
  conditionalTournaments: WeeklyGamePlanConditionalTournament[];
  commitments: WeeklyGamePlanCommitment[];
  amendments: WeeklyGamePlanAmendment[];
}

export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Resolves the deterministic context a WGP must validate against: the
 * player's current/upcoming Poker Week, their locked Weekly BRM Assignment
 * for it, and the active Performance Framework version.
 *
 * Poker Weeks and Weekly BRM Assignments are system/coach-owned records
 * (RLS grants players SELECT only — no INSERT policy exists for either
 * table). Per PRD §17.5 these are produced by a deterministic engine, not
 * authored by the player, so if either is missing we correctly block WGP
 * creation rather than fabricate one client-side — mirroring the
 * "Coach Configuration Required" gate the PRD specifies for BRM band gaps.
 */
export async function resolveWGPContext(userId: PlayerId, coachId: CoachId): Promise<WGPContext> {
  const nowIso = new Date().toISOString();

  const { data: pokerWeek, error: pwError } = await supabase
    .from('poker_weeks')
    .select('*')
    .eq('player_id', userId)
    .gte('end_timestamp', nowIso)
    .order('start_timestamp', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pwError) throw pwError;

  let brmAssignment: WeeklyBRMAssignmentRow | null = null;
  let brmLevel: BRMLevel | null = null;

  if (pokerWeek) {
    const { data: assignment, error: baError } = await supabase
      .from('weekly_brm_assignments')
      .select('*')
      .eq('player_id', userId)
      .eq('poker_week_id', pokerWeek.id)
      .maybeSingle();
    if (baError) throw baError;
    brmAssignment = assignment;

    if (assignment?.brm_level_id) {
      const { data: level, error: levelError } = await supabase
        .from('brm_levels')
        .select('*')
        .eq('id', assignment.brm_level_id)
        .maybeSingle();
      if (levelError) throw levelError;
      brmLevel = level;
    }
  }

  const { data: fw, error: fwError } = await supabase
    .from('performance_frameworks')
    .select('id, coach_id, status')
    .eq('coach_id', coachId)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (fwError) throw fwError;

  let frameworkVersion: FrameworkVersion | null = null;
  if (fw) {
    const { data: ver, error: verError } = await supabase
      .from('framework_versions')
      .select('*')
      .eq('framework_id', fw.id)
      .eq('is_activated', true)
      .maybeSingle();
    if (verError) throw verError;
    frameworkVersion = ver;
  }

  const slotRules = brmLevel ? await fetchSlotRulesForBRMLevel(asBRMLevelId(brmLevel.id)) : null;

  return { pokerWeek, brmAssignment, brmLevel, frameworkVersion, slotRules };
}

export async function fetchExistingWGP(userId: PlayerId, pokerWeekId: PokerWeekId): Promise<WGPFull | null> {
  const { data: plan, error } = await supabase
    .from('weekly_game_plans')
    .select('*')
    .eq('player_id', userId)
    .eq('poker_week_id', pokerWeekId)
    .maybeSingle();
  if (error) throw error;
  if (!plan) return null;

  const [days, tournaments, conditionals, commitments, amendments] = await Promise.all([
    supabase.from('weekly_game_plan_playing_days').select('*').eq('weekly_game_plan_id', plan.id).order('planned_date'),
    supabase.from('weekly_game_plan_tournaments').select('*').eq('weekly_game_plan_id', plan.id).order('slot_number'),
    supabase.from('weekly_game_plan_conditional_tournaments').select('*').eq('weekly_game_plan_id', plan.id),
    supabase.from('weekly_game_plan_commitments').select('*').eq('weekly_game_plan_id', plan.id),
    supabase.from('weekly_game_plan_amendments').select('*').eq('weekly_game_plan_id', plan.id).order('created_at'),
  ]);

  if (days.error) throw days.error;
  if (tournaments.error) throw tournaments.error;
  if (conditionals.error) throw conditionals.error;
  if (commitments.error) throw commitments.error;
  if (amendments.error) throw amendments.error;

  return {
    plan,
    playingDays: days.data || [],
    tournaments: tournaments.data || [],
    conditionalTournaments: conditionals.data || [],
    commitments: commitments.data || [],
    amendments: amendments.data || [],
  };
}

export async function createDraftWGP(
  userId: PlayerId,
  pokerWeekId: PokerWeekId,
  frameworkVersionId: FrameworkVersionId | null,
  brmAssignmentId: BRMAssignmentId | null,
): Promise<WeeklyGamePlan> {
  const { data, error } = await supabase
    .from('weekly_game_plans')
    .insert({
      player_id: userId,
      poker_week_id: pokerWeekId,
      framework_version_id: frameworkVersionId,
      brm_assignment_id: brmAssignmentId,
      status: 'DRAFT',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// Guards every DRAFT-only write below. The fn_check_session_finalized-style
// immutability that Postgres enforces elsewhere (sessions/tournaments,
// activated Framework/BRM/Taxonomy/etc. versions) isn't present on
// weekly_game_plans or its child tables — and the RLS policy ("Players
// manage own weekly game plans") only checks player_id, never status — so
// without this, a LOCKED plan's content (and lockWeeklyGamePlan itself)
// stays writable via anything that bypasses the UI's isLocked read-only
// branch (a stale tab, a second concurrent call, direct API access).
async function assertPlanIsDraft(planId: WeeklyGamePlanId): Promise<void> {
  const { data, error } = await supabase
    .from('weekly_game_plans')
    .select('status')
    .eq('id', planId)
    .single();
  if (error) throw error;
  if (data.status !== 'DRAFT') {
    throw new Error('This Weekly Game Plan is locked and can no longer be edited directly — use an amendment instead.');
  }
}

export async function updateWGPIntentionFocus(planId: WeeklyGamePlanId, weeklyIntention: string, weeklyFocus: string) {
  await assertPlanIsDraft(planId);
  const { error } = await supabase
    .from('weekly_game_plans')
    .update({ weekly_intention: weeklyIntention, weekly_focus: weeklyFocus })
    .eq('id', planId);
  if (error) throw error;
}

// Draft-only editing uses delete+reinsert per child table for simplicity —
// each function below asserts DRAFT status itself (see assertPlanIsDraft)
// rather than relying solely on the UI's isLocked read-only branch.

export async function replacePlayingDays(
  planId: WeeklyGamePlanId,
  rows: { planned_date: string; planned_session_allocation: number }[],
) {
  await assertPlanIsDraft(planId);
  const { error: delErr } = await supabase.from('weekly_game_plan_playing_days').delete().eq('weekly_game_plan_id', planId);
  if (delErr) throw delErr;
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('weekly_game_plan_playing_days')
    .insert(rows.map((r) => ({ weekly_game_plan_id: planId, ...r })));
  if (error) throw error;
}

export async function replaceTournaments(
  planId: WeeklyGamePlanId,
  rows: {
    slot_number: number;
    tournament_name: string;
    permitted_buy_ins: number;
    intended_buy_ins: number;
    planned_date: string | null;
    buy_in_amount: number | null;
  }[],
) {
  await assertPlanIsDraft(planId);
  const { error: delErr } = await supabase.from('weekly_game_plan_tournaments').delete().eq('weekly_game_plan_id', planId);
  if (delErr) throw delErr;
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('weekly_game_plan_tournaments')
    .insert(rows.map((r) => ({ weekly_game_plan_id: planId, ...r })));
  if (error) throw error;
}

export async function replaceConditionalTournaments(
  planId: WeeklyGamePlanId,
  rows: { tournament_name: string; activation_condition: string; permitted_buy_ins: number; buy_in_amount: number | null }[],
) {
  await assertPlanIsDraft(planId);
  const { error: delErr } = await supabase
    .from('weekly_game_plan_conditional_tournaments')
    .delete()
    .eq('weekly_game_plan_id', planId);
  if (delErr) throw delErr;
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('weekly_game_plan_conditional_tournaments')
    .insert(rows.map((r) => ({ weekly_game_plan_id: planId, ...r })));
  if (error) throw error;
}

export async function replaceCommitments(planId: WeeklyGamePlanId, rows: { commitment_text: string }[]) {
  await assertPlanIsDraft(planId);
  const { error: delErr } = await supabase.from('weekly_game_plan_commitments').delete().eq('weekly_game_plan_id', planId);
  if (delErr) throw delErr;
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('weekly_game_plan_commitments')
    .insert(rows.map((r) => ({ weekly_game_plan_id: planId, ...r })));
  if (error) throw error;
}

/**
 * Deterministic validation mirroring PRD §3.5 / §4 / §5:
 *  - active Framework present
 *  - locked Weekly BRM Assignment present
 *  - max two sessions per poker day
 *  - planned tournament slots don't exceed the BRM level's permitted slot count
 *  - intended buy-ins per slot don't exceed that slot's BRM-permitted maximum
 */
export function validateWeeklyGamePlan(
  days: { planned_date: string; planned_session_allocation: number }[],
  tournaments: { slot_number: number; intended_buy_ins: number; planned_date: string; session: 1 | 2; buy_in_amount?: number | null }[],
  ctx: WGPContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!ctx.frameworkVersion) {
    issues.push({ field: 'framework', message: 'No active Performance Framework. Coach Configuration Required.' });
  }
  if (!ctx.brmAssignment || !ctx.brmAssignment.locked_at) {
    issues.push({ field: 'brm', message: 'No locked Weekly BRM Assignment for this Poker Week. Coach Configuration Required.' });
  }

  days.forEach((d, i) => {
    if (d.planned_session_allocation > 2) {
      issues.push({ field: `day-${i}`, message: `${d.planned_date}: maximum two sessions per poker day.` });
    }
    if (d.planned_session_allocation < 1) {
      issues.push({ field: `day-${i}`, message: `${d.planned_date}: session allocation must be at least 1.` });
    }
  });

  if (ctx.brmLevel) {
    if (!ctx.slotRules) {
      issues.push({
        field: 'slots',
        message: `BRM Level ${ctx.brmLevel.level_index} table rules are not yet configured by your coach.`,
      });
    } else {
      // Slot/table rules are a per-SESSION limit — how many tables the
      // player can be registered in at once (§10: "Exceeded Simultaneous
      // Table Limits") — not a week-wide total. Pooling every tournament
      // planned across the whole week (as this used to do) would reject a
      // perfectly valid plan of e.g. four separate single-table sessions
      // just because they collectively touch 4 distinct slot numbers.
      // Group by (day, session) and validate each sitting independently.
      const bySession = new Map<string, typeof tournaments>();
      tournaments.forEach((t) => {
        const key = `${t.planned_date}|${t.session}`;
        const list = bySession.get(key);
        if (list) list.push(t);
        else bySession.set(key, [t]);
      });

      bySession.forEach((sessionTournaments, key) => {
        const [plannedDate, sessionLabel] = key.split('|');
        const usedSlots = new Set(sessionTournaments.map((t) => t.slot_number));
        if (usedSlots.size > ctx.slotRules!.length) {
          issues.push({
            field: `slots-${key}`,
            message: `${plannedDate} Session ${sessionLabel}: BRM Level ${ctx.brmLevel!.level_index} permits ${ctx.slotRules!.length} distinct tournament table(s) at once; ${usedSlots.size} are planned.`,
          });
        }
        sessionTournaments.forEach((t, i) => {
          const rule = ctx.slotRules!.find((s) => s.slotNumber === t.slot_number);
          if (!rule) {
            issues.push({
              field: `tournament-${key}-${i}`,
              message: `${plannedDate} Session ${sessionLabel}, Table ${t.slot_number} is not permitted at BRM Level ${ctx.brmLevel!.level_index}.`,
            });
          } else if (t.intended_buy_ins > rule.maxBuyIns) {
            issues.push({
              field: `tournament-${key}-${i}`,
              message: `${plannedDate} Session ${sessionLabel}, Table ${t.slot_number} exceeds BRM Level ${ctx.brmLevel!.level_index} max of ${rule.maxBuyIns} buy-in(s).`,
            });
          }
          // PRD §3.5: the Weekly Game Plan validates against "tournament
          // buy-in limits", not just slot/table count — the BRM level's flat
          // per-tournament ₹ maximum (already enforced downstream at Session
          // Contract substitution and Tournament logging — see
          // SessionContractView.tsx / tournaments.ts) was never actually
          // checked here despite a comment elsewhere assuming it was.
          const maxAmount = ctx.brmLevel!.max_tournament_buy_in;
          if (maxAmount !== null && t.buy_in_amount != null && t.buy_in_amount > maxAmount) {
            issues.push({
              field: `tournament-amount-${key}-${i}`,
              message: `${plannedDate} Session ${sessionLabel}, Table ${t.slot_number}'s buy-in of ${t.buy_in_amount} exceeds BRM Level ${ctx.brmLevel!.level_index}'s per-tournament maximum of ${maxAmount}.`,
            });
          }
        });
      });
    }
  }

  return issues;
}

export async function lockWeeklyGamePlan(planId: WeeklyGamePlanId) {
  // .eq('status', 'DRAFT') makes this atomic at the row level — closes the
  // TOCTOU gap a separate check-then-write would leave between two
  // concurrent lock calls (see assertPlanIsDraft above for why a check is
  // needed here at all: this table has no DB-level immutability trigger).
  const { data, error } = await supabase
    .from('weekly_game_plans')
    .update({ status: 'LOCKED', locked_at: new Date().toISOString() })
    .eq('id', planId)
    .eq('status', 'DRAFT')
    .select('*')
    .single();
  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('This Weekly Game Plan is already locked.');
    }
    throw error;
  }
  return data;
}

export async function appendAmendment(
  planId: WeeklyGamePlanId,
  playerId: PlayerId,
  amendmentType: string,
  originalReference: Json,
  proposedNewValue: Json,
  reason: string,
  validationResult: Json,
  isViolation: boolean,
) {
  const { data, error } = await supabase
    .from('weekly_game_plan_amendments')
    .insert({
      weekly_game_plan_id: planId,
      player_id: playerId,
      amendment_type: amendmentType,
      original_reference: originalReference,
      proposed_new_value: proposedNewValue,
      reason,
      validation_result: validationResult,
      is_violation: isViolation,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}