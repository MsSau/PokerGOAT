/// <reference types="vite/client" />

import { createClient } from '@supabase/supabase-js';
import { 
  UserRole, 
  PerformanceFramework, 
  FrameworkVersion, 
  BRMConfiguration, 
  BRMConfigVersion, 
  BRMBankrollBand, 
  BRMLevel 
} from '../types';

// Read from env vars with literal hardcoded defaults to guarantee operation in the iframe
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://ojbkvxjphzrbteyipkxo.supabase.co';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IIZLb8w9-PDp9a8bMxKO7g_AYlHEzkF';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Publishable Key is missing. Ensure env vars are configured.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
export async function getUserRole(userId: string, email?: string): Promise<UserRole> {
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
export async function resolveCoachId(userId: string, role: UserRole): Promise<string> {
  if (role === 'COACH') {
    return userId;
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

  return data.coach_id;
}

/**
 * Fetches the active performance framework and version
 */
export async function getActiveFramework(coachId: string): Promise<{
  framework: PerformanceFramework;
  version: FrameworkVersion;
}> {
  // 2. Fetch performance_framework where coach_id = coachId AND status = 'Active'
  const { data: fwData, error: fwError } = await supabase
    .from('performance_frameworks')
    .select('id, coach_id, status')
    .eq('coach_id', coachId)
    .eq('status', 'Active')
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
    .select('id, framework_id, version_number, primary_objective, start_date, end_date, is_activated, created_at')
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
    framework: fwData as PerformanceFramework,
    version: verData as FrameworkVersion,
  };
}

/**
 * Fetches active BRM configurations, versions, bands and levels
 */
export async function getActiveBRM(coachId: string): Promise<{
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
      .select('id, config_id, version_number, is_activated, created_at')
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
      config: configData as BRMConfiguration,
      version: verData as BRMConfigVersion,
      bands: (bandsRes.data || []) as BRMBankrollBand[],
      levels: (levelsRes.data || []) as BRMLevel[],
    };
  } catch (err) {
    console.error('Error fetching BRM configurations:', err);
    return null;
  }
}

export async function fetchPokerWeekBoundaryConfig(coachId: string) {
  const { data, error } = await supabase
    .from('poker_week_boundary_configs')
    .select('*')
    .eq('coach_id', coachId)
    .maybeSingle();
  
  if (error) throw error;
  return data;
}

export async function fetchLatestBRMAssignment(userId: string) {
  const { data, error } = await supabase
    .from('weekly_brm_assignments')
    .select(`
      id, 
      player_id, 
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
  return data;
}

export async function fetchPlayerDashboardData(userId: string) {
  // 1. Fetch profile to get coach_id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('coach_id')
    .eq('id', userId)
    .single();

  if (profileError) throw profileError;

  // 2. Fetch boundary config
  const boundaryConfig = await fetchPokerWeekBoundaryConfig(profile.coach_id);

  // 3. Fetch latest weekly_brm_assignments and join brm_levels
  const { data: brmData, error: brmError } = await supabase
    .from('weekly_brm_assignments')
    .select(`
      id, 
      player_id, 
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

  // 4. Fetch last 10 sessions with verdicts/assessments
  const { data: sessionsData, error: sessionsError } = await supabase
    .from('sessions')
    .select('*, verdicts(*), session_execution_assessments(*), session_outcome_assessments(*)')
    .eq('player_id', userId)
    .order('start_time', { ascending: false })
    .limit(10);

  console.log('Raw returned rows for sessions:', sessionsData);
  console.log('Full sessions query error object:', sessionsError);

  if (sessionsError) {
    throw sessionsError;
  }

  return { brmAssignment: brmData, sessions: sessionsData || [], boundaryConfig };
}
