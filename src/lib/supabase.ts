/// <reference types="vite/client" />

import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { computeCapacity, fetchCurrentPokerWeek } from './sessionContract';
import type { CapacityState, WeeklyBRMAssignmentSummary, WeeklyBRMAssignmentWithLevel } from './sessionContract';
import {
  UserRole,
  PerformanceFramework,
  FrameworkVersion,
  BRMConfiguration,
  BRMConfigVersion,
  BRMBankrollBand,
  BRMLevel
} from '../types';
import { PlayerId, CoachId, asCoachId, asPlayerId } from '../types/ids';

// Read from env vars with literal hardcoded defaults to guarantee operation in the iframe
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://ojbkvxjphzrbteyipkxo.supabase.co';
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IIZLb8w9-PDp9a8bMxKO7g_AYlHEzkF';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Publishable Key is missing. Ensure env vars are configured.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Tests the connection to Supabase.
 */
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    // Attempt a lightweight request to verify connectivity via Auth
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Supabase connection test failed:', error.message);
      return false;
    }
    console.log('Supabase connection successful.');
    return true;
  } catch (err) {
    console.error('Supabase connection test exception:', err);
    return false;
  }
}



/**
 * Fetches the role of the user from the `profiles` table.
 * If the query fails or profiles don't exist, we fallback intelligently based on email keywords or local storage.
 */
export async function getUserRole(userId: PlayerId, email?: string): Promise<UserRole> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching profile role:', error);
    throw error;
  }

  if (data?.role) {
    const upperRole = data.role.toUpperCase();
    if (upperRole === 'COACH' || upperRole === 'PLAYER') {
      return upperRole as UserRole;
    }
  }

  throw new Error('Role not found for user');
}

/**
 * Resolves the relevant coach_id for the user.
 * 1. If role = COACH, it's their own id.
 * 2. If role = PLAYER, it's profiles.coach_id.
 */
export async function resolveCoachId(userId: PlayerId, role: UserRole): Promise<CoachId> {
  if (role === 'COACH') {
    return asCoachId(userId);
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('coach_id')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error resolving coach ID for player:', error);
    throw error;
  }

  if (!data?.coach_id) {
    throw new Error('Coach ID not found for player');
  }

  return asCoachId(data.coach_id);
}

// Non-throwing counterpart to resolveCoachId, for callers that need to tell
// "not assigned yet" apart from an actual error — App.tsx uses this to show
// a waiting screen for a freshly-registered player with no coach_id yet,
// rather than letting every coach-dependent fetch downstream fail.
export async function fetchProfileCoachId(userId: PlayerId): Promise<CoachId | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('coach_id')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data?.coach_id ? asCoachId(data.coach_id) : null;
}

/**
 * Fetches the active performance framework and version
 */
export async function getActiveFramework(coachId: CoachId): Promise<{
  framework: PerformanceFramework;
  version: FrameworkVersion;
}> {
  // 2. Fetch performance_framework where coach_id = coachId AND status = 'Active'
  const { data: fwData, error: fwError } = await supabase
    .from('performance_frameworks')
    .select('id, coach_id, status')
    .eq('coach_id', coachId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (fwError) {
    console.error('Error fetching active performance framework:', fwError);
    throw fwError;
  }

  if (!fwData) {
    throw new Error('No active performance framework found');
  }

  // 3. Fetch framework_version where framework_id = fwData.id AND is_activated = true
  const { data: verData, error: verError } = await supabase
    .from('framework_versions')
    .select('id, framework_id, version_number, primary_objective, start_date, end_date, is_activated, created_at, change_reason')
    .eq('framework_id', fwData.id)
    .eq('is_activated', true)
    .maybeSingle();

  if (verError) {
    console.error('Error fetching active framework version:', verError);
    throw verError;
  }

  if (!verData) {
    throw new Error('No active framework version found');
  }

  return {
    framework: fwData,
    version: verData,
  };
}

/**
 * Fetches active BRM configurations, versions, bands and levels
 */
export async function getActiveBRM(coachId: CoachId): Promise<{
  config: BRMConfiguration;
  version: BRMConfigVersion;
  bands: BRMBankrollBand[];
  levels: BRMLevel[];
} | null> {
  try {
    // 4. Fetch brm_configurations where coach_id = coachId
    if (!coachId) {
        console.error('coachId is undefined!');
        return null;
    }
    const { data: configData, error: configError } = await supabase
      .from('brm_configurations')
      .select('*')
      .eq('coach_id', coachId)
      .maybeSingle();

    if (configError) {
      console.error('Supabase brm_configurations error:', configError);
      throw configError;
    }

    if (!configData) {
      console.log('No BRM configuration found for coachId:', coachId);
      return null;
    }

    // 5. Fetch brm_config_versions where config_id = configData.id AND is_activated = true
    const { data: verData, error: verError } = await supabase
      .from('brm_config_versions')
      .select('id, config_id, version_number, is_activated, created_at, change_reason')
      .eq('config_id', configData.id)
      .eq('is_activated', true)
      .maybeSingle();

    if (verError || !verData) {
      throw new Error(verError?.message || 'No activated BRM version found');
    }

    // 6. Fetch brm_bankroll_bands and brm_levels where version_id = verData.id
    const [bandsRes, levelsRes] = await Promise.all([
      supabase
        .from('brm_bankroll_bands')
        .select('id, version_id, min_bankroll, max_bankroll, session_stop_loss, day_stop_loss, week_stop_loss, level_index')
        .eq('version_id', verData.id)
        .order('level_index', { ascending: true }),
      supabase
        .from('brm_levels')
        .select('id, version_id, level_index, max_tournament_buy_in, max_session_exposure')
        .eq('version_id', verData.id)
        .order('level_index', { ascending: true })
    ]);

    if (bandsRes.error) throw bandsRes.error;
    if (levelsRes.error) throw levelsRes.error;

    return {
      config: configData,
      version: verData,
      bands: bandsRes.data || [],
      levels: levelsRes.data || [],
    };
  } catch (err) {
    console.error('Error fetching BRM configurations:', err);
    return null;
  }
}

async function fetchPokerWeekBoundaryConfig(coachId: CoachId) {
  const { data, error } = await supabase
    .from('poker_week_boundary_configs')
    .select('*')
    .eq('coach_id', coachId)
    .maybeSingle();
  
  if (error) throw error;
  return data;
}

export async function fetchLatestBRMAssignment(userId: PlayerId): Promise<WeeklyBRMAssignmentSummary | null> {
  const { data, error } = await supabase
    .from('weekly_brm_assignments')
    .select(`
      id, 
      player_id,
      poker_week_id, 
      brm_level_id, 
      week_stop_loss_snapshot,
      session_stop_loss_snapshot,
      day_stop_loss_snapshot,
      locked_at
    `)
    .eq('player_id', userId)
    .order('locked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as WeeklyBRMAssignmentSummary | null;
}

export async function fetchPlayerDashboardData(userId: PlayerId) {
  // 1. Fetch profile to get coach_id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('coach_id, display_name')
    .eq('id', userId)
    .single();

  if (profileError) throw profileError;
  if (!profile.coach_id) throw new Error('No coach assigned to this player profile.');

  // 2. Fetch boundary config
  const boundaryConfig = await fetchPokerWeekBoundaryConfig(asCoachId(profile.coach_id));

  // 3. Fetch latest weekly_brm_assignments and join brm_levels
  const { data: brmData, error: brmError } = await supabase
    .from('weekly_brm_assignments')
    .select(`
      id, 
      player_id, 
      poker_week_id,
      brm_level_id, 
      week_stop_loss_snapshot,
      session_stop_loss_snapshot,
      day_stop_loss_snapshot,
      locked_at,
      brm_levels!inner (
        level_index
      )
    `)
    .eq('player_id', userId)
    .order('locked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (brmError) {
    throw brmError;
  }
  // weekly_brm_assignments -> brm_levels is isOneToOne: false, so Supabase
  // types (and returns) the joined relation as an array even though each
  // assignment has exactly one level. Flatten here so the shape matches
  // WeeklyBRMAssignmentWithLevel.brm_levels ({ level_index } | null, not an
  // array) for every consumer of this function.
  const normalizedBrmData: WeeklyBRMAssignmentWithLevel | null = brmData
    ? ({
        ...brmData,
        brm_levels: Array.isArray(brmData.brm_levels)
          ? brmData.brm_levels[0] ?? null
          : brmData.brm_levels,
      } as WeeklyBRMAssignmentWithLevel)
    : null;

  // 4. Fetch last 10 sessions with verdicts/assessments
  const { data: sessionsData, error: sessionsError } = await supabase
    .from('sessions')
    .select('*, verdicts(*), session_execution_assessments(*), session_outcome_assessments(*), preparation_records(medal_tier)')
    .eq('player_id', userId)
    .order('start_time', { ascending: false })
    .limit(10);

  if (sessionsError) {
    throw sessionsError;
  }

  // 5. Remaining Day/Week capacity (§6) — the assigned snapshot minus realized
  // losses from FINALIZED sessions so far this Poker Week, same computation
  // the Session Contract screen uses. Without this, "remaining" would just be
  // the static assigned limit, never reflecting what's actually been lost.
  let capacity: CapacityState | null = null;
  if (normalizedBrmData) {
    const currentWeek = await fetchCurrentPokerWeek(userId);
    if (currentWeek) {
      capacity = await computeCapacity(userId, currentWeek, normalizedBrmData);
    }
  }

  return {
    displayName: profile.display_name,
    brmAssignment: normalizedBrmData,
    sessions: sessionsData || [],
    boundaryConfig,
    capacity,
  };
}

export async function fetchActiveSession(playerId: PlayerId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, contract_id, start_time, status')
    .eq('player_id', playerId)
    .eq('status', 'ACTIVE')
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

// ============================================================================
// REGISTRATION — self-service sign-up (PLAYER or COACH), plus the coach-side
// roster-claiming step that follows it. Until this, every `profiles` row was
// created manually — there was no INSERT policy on the table at all.
//
// `auth.signUp` may or may not return an active session depending on this
// Supabase project's email-confirmation setting (can't be verified from this
// environment which is live). If it does, we proceed straight to creating
// the `profiles` row in the same call; if it doesn't (data.session is null),
// there is no authenticated context yet to write with, so callers get
// `{ status: 'pending_confirmation' }` back and should tell the user to
// confirm their email, then sign in normally.
// ============================================================================

export type RegisterResult<T> = { status: 'ok'; userId: T } | { status: 'pending_confirmation' };

export interface RegisterPlayerParams {
  email: string;
  password: string;
  displayName: string;
  openingBankroll: number;
}

// Records the player's self-declared opening bankroll as a real
// OPENING_CAPITAL ledger entry immediately — a deliberate, narrowly-scoped
// exception to bankroll_ledger_entries' normal coach-only OPENING_CAPITAL
// rule (see the "Players self-declare opening capital once at registration"
// RLS policy's comment in the migration for the full rationale/trade-off).
export async function registerPlayer(params: RegisterPlayerParams): Promise<RegisterResult<PlayerId>> {
  const { data, error } = await supabase.auth.signUp({ email: params.email, password: params.password });
  if (error) throw error;
  if (!data.session || !data.user) {
    return { status: 'pending_confirmation' };
  }
  const userId = asPlayerId(data.user.id);

  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    email: params.email,
    role: 'PLAYER',
    display_name: params.displayName.trim() || null,
  });
  if (profileError) throw profileError;

  if (params.openingBankroll > 0) {
    const { error: bankrollError } = await supabase.from('bankroll_ledger_entries').insert({
      player_id: userId,
      recorded_by: userId,
      entry_type: 'OPENING_CAPITAL',
      amount: params.openingBankroll,
      note: 'Self-declared at registration',
    });
    if (bankrollError) throw bankrollError;
  }

  return { status: 'ok', userId };
}

export interface RegisterCoachParams {
  email: string;
  password: string;
  displayName: string;
}

export async function registerCoach(params: RegisterCoachParams): Promise<RegisterResult<CoachId>> {
  const { data, error } = await supabase.auth.signUp({ email: params.email, password: params.password });
  if (error) throw error;
  if (!data.session || !data.user) {
    return { status: 'pending_confirmation' };
  }
  const userId = asCoachId(data.user.id);

  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    email: params.email,
    role: 'COACH',
    display_name: params.displayName.trim() || null,
  });
  if (profileError) throw profileError;

  return { status: 'ok', userId };
}

export interface UnclaimedPlayer {
  id: PlayerId;
  email: string;
  displayName: string | null;
}

// Every PLAYER profile with no coach yet — visible only to authenticated
// COACHes (see "Coaches see unclaimed players" RLS policy, gated by
// fn_is_coach()), for the registration-time roster-claim picker.
export async function fetchUnclaimedPlayers(): Promise<UnclaimedPlayer[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .is('coach_id', null)
    .eq('role', 'PLAYER');
  if (error) throw error;
  return (data || []).map((p) => ({ id: asPlayerId(p.id), email: p.email, displayName: p.display_name }));
}

// One UPDATE per player rather than a single .in(...) batch — mirrors this
// codebase's existing "two-call MVP shortcut" posture (see sessionContract.ts's
// lockContractAndStartSession comment) rather than introducing a new RPC for
// this. The RLS policy's own USING clause (coach_id IS NULL) makes each call
// a no-op, not an error, if another coach claimed that player first.
export async function claimPlayers(coachId: CoachId, playerIds: PlayerId[]): Promise<void> {
  for (const playerId of playerIds) {
    const { error } = await supabase
      .from('profiles')
      .update({ coach_id: coachId })
      .eq('id', playerId)
      .is('coach_id', null);
    if (error) throw error;
  }
}