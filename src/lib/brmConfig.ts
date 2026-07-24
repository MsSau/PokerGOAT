// src/lib/brmConfig.ts
//
// Coach-side data access + mutations for the BRM/Bankroll engine config
// (PRD §4): bankroll bands, BRM levels, and their versioning. There is one
// brm_configurations row per coach (a singleton, not a Draft/Active/Archived
// list like the Performance Framework) — what varies is which
// brm_config_versions row is_activated.
//
// Same immutability model as performanceFramework.ts: brm_config_versions
// carries the identical tr_enforce_immutability trigger, so an already-
// activated version's row can never be content-edited, only superseded by a
// new version (with a mandatory reason) while the old one is flipped off
// and kept forever as the audit record. brm_bankroll_bands/brm_levels rows
// aren't DB-enforced immutable themselves, but are treated as append-only
// per version at the application level here for the same reason — editing
// them in place would silently rewrite history the version row exists to
// protect.

import { supabase } from './supabase';
import { BRMConfiguration, BRMConfigVersion } from '../types';
import { DEFAULT_SLOT_RULES, SlotRule } from './brmRules';

export interface BRMLevelRow {
  level_index: number;
  min_bankroll: number;
  max_bankroll: number;
  session_stop_loss: number;
  day_stop_loss: number;
  week_stop_loss: number;
  max_tournament_buy_in: number | null;
  max_session_exposure: number | null;
  // Coach-configurable per PRD §4/§20 — see brm_level_slot_rules
  // (20260721020000 migration). Only meaningful for levels that also have a
  // brm_levels row (i.e. max_tournament_buy_in/max_session_exposure set);
  // ignored otherwise since there's nothing to attach it to.
  slot_rules: SlotRule[];
}

// PRD §4's shipped defaults. Bankroll bands are defined for Levels 1-8;
// tournament registration rules (max buy-in / max session exposure) and
// slot rules are only specified for Levels 1-5 — Levels 6-8 are
// intentionally left null/empty, mirroring brmRules.ts's existing stance of
// never inventing those values.
export const DEFAULT_BRM_ROWS: BRMLevelRow[] = [
  { level_index: 1, min_bankroll: 0, max_bankroll: 200000, session_stop_loss: 11000, day_stop_loss: 22000, week_stop_loss: 44000, max_tournament_buy_in: 5500, max_session_exposure: 11000, slot_rules: DEFAULT_SLOT_RULES[1] },
  { level_index: 2, min_bankroll: 200000, max_bankroll: 400000, session_stop_loss: 16500, day_stop_loss: 33000, week_stop_loss: 50000, max_tournament_buy_in: 5500, max_session_exposure: 16500, slot_rules: DEFAULT_SLOT_RULES[2] },
  { level_index: 3, min_bankroll: 400000, max_bankroll: 600000, session_stop_loss: 16500, day_stop_loss: 33000, week_stop_loss: 66000, max_tournament_buy_in: 5500, max_session_exposure: 22000, slot_rules: DEFAULT_SLOT_RULES[3] },
  { level_index: 4, min_bankroll: 600000, max_bankroll: 800000, session_stop_loss: 22000, day_stop_loss: 44000, week_stop_loss: 88000, max_tournament_buy_in: 5500, max_session_exposure: 33000, slot_rules: DEFAULT_SLOT_RULES[4] },
  { level_index: 5, min_bankroll: 800000, max_bankroll: 1000000, session_stop_loss: 33000, day_stop_loss: 66000, week_stop_loss: 132000, max_tournament_buy_in: 12000, max_session_exposure: 45000, slot_rules: DEFAULT_SLOT_RULES[5] },
  { level_index: 6, min_bankroll: 1000000, max_bankroll: 1400000, session_stop_loss: 35000, day_stop_loss: 70000, week_stop_loss: 140000, max_tournament_buy_in: null, max_session_exposure: null, slot_rules: [] },
  { level_index: 7, min_bankroll: 1400000, max_bankroll: 1800000, session_stop_loss: 60000, day_stop_loss: 120000, week_stop_loss: 240000, max_tournament_buy_in: null, max_session_exposure: null, slot_rules: [] },
  { level_index: 8, min_bankroll: 1800000, max_bankroll: 2000000, session_stop_loss: 75000, day_stop_loss: 150000, week_stop_loss: 300000, max_tournament_buy_in: null, max_session_exposure: null, slot_rules: [] },
];

export async function fetchBRMConfigForCoach(coachId: string): Promise<BRMConfiguration | null> {
  const { data, error } = await supabase.from('brm_configurations').select('*').eq('coach_id', coachId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Full version history for this config, newest first — the Version History tab. */
export async function fetchBRMVersions(configId: string): Promise<BRMConfigVersion[]> {
  const { data, error } = await supabase
    .from('brm_config_versions')
    .select('*')
    .eq('config_id', configId)
    .order('version_number', { ascending: false });
  if (error) throw error;
  return data || [];
}

export function currentBRMVersion(versions: BRMConfigVersion[]): BRMConfigVersion | null {
  return versions.find((v) => v.is_activated) ?? versions[0] ?? null;
}

/** Bands + levels + slot rules for one version, merged by level_index into one spreadsheet-ready row per level. */
export async function fetchRowsForVersion(versionId: string): Promise<BRMLevelRow[]> {
  const [bandsRes, levelsRes] = await Promise.all([
    supabase.from('brm_bankroll_bands').select('*').eq('version_id', versionId).order('level_index', { ascending: true }),
    supabase.from('brm_levels').select('*').eq('version_id', versionId).order('level_index', { ascending: true }),
  ]);
  if (bandsRes.error) throw bandsRes.error;
  if (levelsRes.error) throw levelsRes.error;

  const levelIds = (levelsRes.data || []).map((l) => l.id);
  const slotRulesByLevelId = new Map<string, SlotRule[]>();
  if (levelIds.length > 0) {
    const slotRulesRes = await supabase
      .from('brm_level_slot_rules')
      .select('*')
      .in('brm_level_id', levelIds)
      .order('slot_number', { ascending: true });
    if (slotRulesRes.error) throw slotRulesRes.error;
    (slotRulesRes.data || []).forEach((r) => {
      const list = slotRulesByLevelId.get(r.brm_level_id) || [];
      list.push({ slotNumber: r.slot_number, maxBuyIns: r.max_buy_ins });
      slotRulesByLevelId.set(r.brm_level_id, list);
    });
  }

  const levelByIndex = new Map((levelsRes.data || []).map((l) => [l.level_index, l]));

  return (bandsRes.data || []).map((band) => {
    const level = levelByIndex.get(band.level_index);
    return {
      level_index: band.level_index,
      min_bankroll: band.min_bankroll,
      max_bankroll: band.max_bankroll,
      session_stop_loss: band.session_stop_loss,
      day_stop_loss: band.day_stop_loss,
      week_stop_loss: band.week_stop_loss,
      max_tournament_buy_in: level?.max_tournament_buy_in ?? null,
      max_session_exposure: level?.max_session_exposure ?? null,
      slot_rules: (level && slotRulesByLevelId.get(level.id)) || [],
    };
  });
}

async function insertRowsForVersion(versionId: string, rows: BRMLevelRow[]): Promise<void> {
  const { error: bandsError } = await supabase.from('brm_bankroll_bands').insert(
    rows.map((r) => ({
      version_id: versionId,
      level_index: r.level_index,
      min_bankroll: r.min_bankroll,
      max_bankroll: r.max_bankroll,
      session_stop_loss: r.session_stop_loss,
      day_stop_loss: r.day_stop_loss,
      week_stop_loss: r.week_stop_loss,
    })),
  );
  if (bandsError) throw bandsError;

  const levelRows = rows.filter((r) => r.max_tournament_buy_in !== null || r.max_session_exposure !== null);
  if (levelRows.length > 0) {
    const { data: insertedLevels, error: levelsError } = await supabase
      .from('brm_levels')
      .insert(
        levelRows.map((r) => ({
          version_id: versionId,
          level_index: r.level_index,
          max_tournament_buy_in: r.max_tournament_buy_in,
          max_session_exposure: r.max_session_exposure,
        })),
      )
      .select('id, level_index');
    if (levelsError) throw levelsError;

    const levelIdByIndex = new Map((insertedLevels || []).map((l) => [l.level_index, l.id]));
    const slotRuleRows = levelRows.flatMap((r) => {
      const levelId = levelIdByIndex.get(r.level_index);
      if (!levelId) return [];
      return r.slot_rules.map((s) => ({ brm_level_id: levelId, slot_number: s.slotNumber, max_buy_ins: s.maxBuyIns }));
    });
    if (slotRuleRows.length > 0) {
      const { error: slotRulesError } = await supabase.from('brm_level_slot_rules').insert(slotRuleRows);
      if (slotRulesError) throw slotRulesError;
    }
  }
}

/** First-time setup: creates the coach's singleton BRM config with its first (already-active) version. */
export async function createBRMConfig(coachId: string, rows: BRMLevelRow[]): Promise<{ config: BRMConfiguration; version: BRMConfigVersion }> {
  const { data: config, error: configError } = await supabase.from('brm_configurations').insert({ coach_id: coachId }).select('*').single();
  if (configError) throw configError;

  const { data: version, error: versionError } = await supabase
    .from('brm_config_versions')
    .insert({ config_id: config.id, version_number: 1, is_activated: true })
    .select('*')
    .single();
  if (versionError) throw versionError;

  await insertRowsForVersion(version.id, rows);

  return { config, version };
}

/**
 * Edits the config's live bankroll bands/levels. Cannot touch the current
 * version's rows (immutability trigger + append-only convention) — inserts
 * version N+1 with the coach's mandatory reason, writes the new rows there,
 * and flips the previous version off.
 */
export async function reviseBRMConfig(
  configId: string,
  currentVersion: BRMConfigVersion,
  rows: BRMLevelRow[],
  reason: string,
): Promise<BRMConfigVersion> {
  // currentVersion.version_number + 1 isn't safe on its own: a version
  // history can have deactivated rows numbered higher than the currently
  // active one (e.g. a revision whose bands/levels insert failed after the
  // version row was already created — see 20260721020000's write-RLS fix).
  // Basing the next number on the true max avoids colliding with those.
  const { data: latest, error: latestError } = await supabase
    .from('brm_config_versions')
    .select('version_number')
    .eq('config_id', configId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();
  if (latestError) throw latestError;

  const { data: newVersion, error: versionError } = await supabase
    .from('brm_config_versions')
    .insert({
      config_id: configId,
      version_number: latest.version_number + 1,
      is_activated: true,
      change_reason: reason,
    })
    .select('*')
    .single();
  if (versionError) throw versionError;

  await insertRowsForVersion(newVersion.id, rows);

  // .select() + a length check — an UPDATE matching zero rows succeeds
  // silently in PostgREST (e.g. an RLS gap), which is exactly how
  // framework_versions ended up with two simultaneously-active rows
  // before this same pattern was added there. Fail loudly instead.
  const { data: deactivated, error: updError } = await supabase
    .from('brm_config_versions')
    .update({ is_activated: false })
    .eq('id', currentVersion.id)
    .select('id');
  if (updError) throw updError;
  if (!deactivated || deactivated.length === 0) {
    throw new Error(`Failed to deactivate BRM config version ${currentVersion.id} — it may no longer exist or you may lack permission.`);
  }

  return newVersion;
}
