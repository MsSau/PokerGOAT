export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bankroll_ledger_entries: {
        Row: {
          amount: number
          created_at: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: string
          note: string | null
          player_id: string
          recorded_by: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          note?: string | null
          player_id: string
          recorded_by: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          note?: string | null
          player_id?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "bankroll_ledger_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "bankroll_ledger_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bankroll_ledger_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "bankroll_ledger_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      behavioral_dimension_assessments: {
        Row: {
          biggest_concern: string | null
          confidence: number
          dimension: Database["public"]["Enums"]["dimension_type"]
          evidence_window: string
          id: string
          radar_index: number | null
          radar_methodology_version: string
          recurring_patterns: Json | null
          related_coaching_points: Json | null
          snapshot_id: string
          state: string
          strongest_positive_signal: string | null
          supporting_evidence: Json
          trend: string
        }
        Insert: {
          biggest_concern?: string | null
          confidence: number
          dimension: Database["public"]["Enums"]["dimension_type"]
          evidence_window?: string
          id?: string
          radar_index?: number | null
          radar_methodology_version?: string
          recurring_patterns?: Json | null
          related_coaching_points?: Json | null
          snapshot_id: string
          state: string
          strongest_positive_signal?: string | null
          supporting_evidence?: Json
          trend: string
        }
        Update: {
          biggest_concern?: string | null
          confidence?: number
          dimension?: Database["public"]["Enums"]["dimension_type"]
          evidence_window?: string
          id?: string
          radar_index?: number | null
          radar_methodology_version?: string
          recurring_patterns?: Json | null
          related_coaching_points?: Json | null
          snapshot_id?: string
          state?: string
          strongest_positive_signal?: string | null
          supporting_evidence?: Json
          trend?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavioral_dimension_assessments_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "behavioral_profile_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      behavioral_pattern_evidence: {
        Row: {
          evidence_entity_id: string
          evidence_entity_type: string
          id: string
          note: string | null
          pattern_id: string
        }
        Insert: {
          evidence_entity_id: string
          evidence_entity_type: string
          id?: string
          note?: string | null
          pattern_id: string
        }
        Update: {
          evidence_entity_id?: string
          evidence_entity_type?: string
          id?: string
          note?: string | null
          pattern_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavioral_pattern_evidence_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "behavioral_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      behavioral_patterns: {
        Row: {
          confidence: number
          created_at: string | null
          description: string
          id: string
          pattern_type: string
          player_id: string
          snapshot_id: string | null
        }
        Insert: {
          confidence: number
          created_at?: string | null
          description: string
          id?: string
          pattern_type: string
          player_id: string
          snapshot_id?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string | null
          description?: string
          id?: string
          pattern_type?: string
          player_id?: string
          snapshot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "behavioral_patterns_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "behavioral_patterns_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "behavioral_patterns_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "behavioral_profile_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      behavioral_profile_snapshots: {
        Row: {
          created_at: string | null
          id: string
          player_id: string
          snapshot_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          player_id: string
          snapshot_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          player_id?: string
          snapshot_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavioral_profile_snapshots_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "behavioral_profile_snapshots_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brm_bankroll_bands: {
        Row: {
          day_stop_loss: number
          id: string
          level_index: number
          max_bankroll: number
          min_bankroll: number
          session_stop_loss: number
          version_id: string
          week_stop_loss: number
        }
        Insert: {
          day_stop_loss: number
          id?: string
          level_index: number
          max_bankroll: number
          min_bankroll: number
          session_stop_loss: number
          version_id: string
          week_stop_loss: number
        }
        Update: {
          day_stop_loss?: number
          id?: string
          level_index?: number
          max_bankroll?: number
          min_bankroll?: number
          session_stop_loss?: number
          version_id?: string
          week_stop_loss?: number
        }
        Relationships: [
          {
            foreignKeyName: "brm_bankroll_bands_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "brm_config_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      brm_config_versions: {
        Row: {
          change_reason: string | null
          config_id: string
          created_at: string | null
          id: string
          is_activated: boolean | null
          version_number: number
        }
        Insert: {
          change_reason?: string | null
          config_id: string
          created_at?: string | null
          id?: string
          is_activated?: boolean | null
          version_number: number
        }
        Update: {
          change_reason?: string | null
          config_id?: string
          created_at?: string | null
          id?: string
          is_activated?: boolean | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "brm_config_versions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "brm_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      brm_configurations: {
        Row: {
          coach_id: string
          id: string
        }
        Insert: {
          coach_id: string
          id?: string
        }
        Update: {
          coach_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brm_configurations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "brm_configurations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brm_level_slot_rules: {
        Row: {
          brm_level_id: string
          id: string
          max_buy_ins: number
          slot_number: number
        }
        Insert: {
          brm_level_id: string
          id?: string
          max_buy_ins: number
          slot_number: number
        }
        Update: {
          brm_level_id?: string
          id?: string
          max_buy_ins?: number
          slot_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "brm_level_slot_rules_brm_level_id_fkey"
            columns: ["brm_level_id"]
            isOneToOne: false
            referencedRelation: "brm_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      brm_levels: {
        Row: {
          id: string
          level_index: number
          max_session_exposure: number | null
          max_tournament_buy_in: number | null
          version_id: string
        }
        Insert: {
          id?: string
          level_index: number
          max_session_exposure?: number | null
          max_tournament_buy_in?: number | null
          version_id: string
        }
        Update: {
          id?: string
          level_index?: number
          max_session_exposure?: number | null
          max_tournament_buy_in?: number | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brm_levels_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "brm_config_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_directives: {
        Row: {
          created_at: string | null
          directive_text: string
          id: string
          player_id: string
          review_id: string | null
        }
        Insert: {
          created_at?: string | null
          directive_text: string
          id?: string
          player_id: string
          review_id?: string | null
        }
        Update: {
          created_at?: string | null
          directive_text?: string
          id?: string
          player_id?: string
          review_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_directives_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "coach_directives_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_directives_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "coach_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_notes: {
        Row: {
          coach_id: string
          content: string
          created_at: string | null
          id: string
          note_type: string
          player_id: string
          review_id: string | null
        }
        Insert: {
          coach_id: string
          content: string
          created_at?: string | null
          id?: string
          note_type?: string
          player_id: string
          review_id?: string | null
        }
        Update: {
          coach_id?: string
          content?: string
          created_at?: string | null
          id?: string
          note_type?: string
          player_id?: string
          review_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "coach_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "coach_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "coach_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_review_agreed_actions: {
        Row: {
          created_at: string | null
          description: string
          id: string
          review_id: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          review_id: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_review_agreed_actions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "coach_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_reviews: {
        Row: {
          brief_validation:
            | Database["public"]["Enums"]["brief_validation"]
            | null
          coach_id: string
          created_at: string | null
          id: string
          next_review_date: string | null
          player_id: string
          status: Database["public"]["Enums"]["review_status"]
          validation_note: string | null
        }
        Insert: {
          brief_validation?:
            | Database["public"]["Enums"]["brief_validation"]
            | null
          coach_id: string
          created_at?: string | null
          id?: string
          next_review_date?: string | null
          player_id: string
          status?: Database["public"]["Enums"]["review_status"]
          validation_note?: string | null
        }
        Update: {
          brief_validation?:
            | Database["public"]["Enums"]["brief_validation"]
            | null
          coach_id?: string
          created_at?: string | null
          id?: string
          next_review_date?: string | null
          player_id?: string
          status?: Database["public"]["Enums"]["review_status"]
          validation_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_reviews_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "coach_reviews_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_reviews_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "coach_reviews_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_priorities: {
        Row: {
          created_at: string | null
          description: string
          id: string
          player_id: string
          review_id: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          player_id: string
          review_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          player_id?: string
          review_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_priorities_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "coaching_priorities_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_priorities_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "coach_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      deep_analysis_messages: {
        Row: {
          content: string
          created_at: string | null
          evidence_context_reference: Json | null
          id: string
          sender_type: Database["public"]["Enums"]["sender_type"]
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          evidence_context_reference?: Json | null
          id?: string
          sender_type: Database["public"]["Enums"]["sender_type"]
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          evidence_context_reference?: Json | null
          id?: string
          sender_type?: Database["public"]["Enums"]["sender_type"]
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deep_analysis_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "deep_analysis_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      deep_analysis_threads: {
        Row: {
          closed_at: string | null
          coach_id: string
          created_at: string | null
          id: string
          player_id: string
          session_id: string | null
          verdict_id: string | null
        }
        Insert: {
          closed_at?: string | null
          coach_id: string
          created_at?: string | null
          id?: string
          player_id: string
          session_id?: string | null
          verdict_id?: string | null
        }
        Update: {
          closed_at?: string | null
          coach_id?: string
          created_at?: string | null
          id?: string
          player_id?: string
          session_id?: string | null
          verdict_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deep_analysis_threads_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "deep_analysis_threads_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_analysis_threads_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "deep_analysis_threads_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_analysis_threads_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_analysis_threads_verdict_id_fkey"
            columns: ["verdict_id"]
            isOneToOne: false
            referencedRelation: "verdicts"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_events: {
        Row: {
          created_at: string | null
          id: string
          is_override: boolean
          new_stage: number
          old_stage: number
          reason: string | null
          rule_version_id: string
          satisfied_conditions: Json | null
          supersedes_event_id: string | null
          track_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_override?: boolean
          new_stage: number
          old_stage: number
          reason?: string | null
          rule_version_id: string
          satisfied_conditions?: Json | null
          supersedes_event_id?: string | null
          track_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_override?: boolean
          new_stage?: number
          old_stage?: number
          reason?: string | null
          rule_version_id?: string
          satisfied_conditions?: Json | null
          supersedes_event_id?: string | null
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_events_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "escalation_rule_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_events_supersedes_event_id_fkey"
            columns: ["supersedes_event_id"]
            isOneToOne: false
            referencedRelation: "escalation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_events_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "escalation_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_rule_versions: {
        Row: {
          created_at: string | null
          id: string
          is_activated: boolean | null
          version_number: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_activated?: boolean | null
          version_number: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_activated?: boolean | null
          version_number?: number
        }
        Relationships: []
      }
      escalation_tracks: {
        Row: {
          current_stage_index: number
          execution_action_id: string
          id: string
          last_occurrence_at: string | null
          player_id: string
        }
        Insert: {
          current_stage_index?: number
          execution_action_id: string
          id?: string
          last_occurrence_at?: string | null
          player_id: string
        }
        Update: {
          current_stage_index?: number
          execution_action_id?: string
          id?: string
          last_occurrence_at?: string | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_tracks_execution_action_id_fkey"
            columns: ["execution_action_id"]
            isOneToOne: false
            referencedRelation: "execution_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_tracks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "escalation_tracks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_action_occurrences: {
        Row: {
          created_at: string | null
          detected_via: string
          escalation_stage_produced: number | null
          execution_action_id: string
          hard_gate_triggered: boolean
          id: string
          is_non_compliant: boolean
          occurred_at: string
          session_id: string
          tournament_entry_id: string | null
          tournament_id: string | null
        }
        Insert: {
          created_at?: string | null
          detected_via: string
          escalation_stage_produced?: number | null
          execution_action_id: string
          hard_gate_triggered?: boolean
          id?: string
          is_non_compliant?: boolean
          occurred_at?: string
          session_id: string
          tournament_entry_id?: string | null
          tournament_id?: string | null
        }
        Update: {
          created_at?: string | null
          detected_via?: string
          escalation_stage_produced?: number | null
          execution_action_id?: string
          hard_gate_triggered?: boolean
          id?: string
          is_non_compliant?: boolean
          occurred_at?: string
          session_id?: string
          tournament_entry_id?: string | null
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_action_occurrences_execution_action_id_fkey"
            columns: ["execution_action_id"]
            isOneToOne: false
            referencedRelation: "execution_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_action_occurrences_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_action_occurrences_tournament_entry_id_fkey"
            columns: ["tournament_entry_id"]
            isOneToOne: false
            referencedRelation: "tournament_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_action_occurrences_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_actions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          base_severity: Database["public"]["Enums"]["severity_type"]
          change_reason: string | null
          description: string | null
          detection_method: string | null
          dimension: Database["public"]["Enums"]["dimension_type"]
          id: string
          is_hard_gate: boolean | null
          name: string
          proposed_by: string | null
          status: Database["public"]["Enums"]["execution_action_status"]
          taxonomy_version: string | null
          taxonomy_version_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_severity: Database["public"]["Enums"]["severity_type"]
          change_reason?: string | null
          description?: string | null
          detection_method?: string | null
          dimension: Database["public"]["Enums"]["dimension_type"]
          id?: string
          is_hard_gate?: boolean | null
          name: string
          proposed_by?: string | null
          status?: Database["public"]["Enums"]["execution_action_status"]
          taxonomy_version?: string | null
          taxonomy_version_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_severity?: Database["public"]["Enums"]["severity_type"]
          change_reason?: string | null
          description?: string | null
          detection_method?: string | null
          dimension?: Database["public"]["Enums"]["dimension_type"]
          id?: string
          is_hard_gate?: boolean | null
          name?: string
          proposed_by?: string | null
          status?: Database["public"]["Enums"]["execution_action_status"]
          taxonomy_version?: string | null
          taxonomy_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_actions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "execution_actions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_actions_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "execution_actions_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_actions_taxonomy_version_id_fkey"
            columns: ["taxonomy_version_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_taxonomies: {
        Row: {
          coach_id: string
          id: string
        }
        Insert: {
          coach_id: string
          id?: string
        }
        Update: {
          coach_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_taxonomies_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "execution_taxonomies_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      framework_versions: {
        Row: {
          change_reason: string | null
          created_at: string | null
          end_date: string | null
          framework_id: string
          id: string
          is_activated: boolean | null
          primary_objective: string
          start_date: string | null
          version_number: number
        }
        Insert: {
          change_reason?: string | null
          created_at?: string | null
          end_date?: string | null
          framework_id: string
          id?: string
          is_activated?: boolean | null
          primary_objective: string
          start_date?: string | null
          version_number: number
        }
        Update: {
          change_reason?: string | null
          created_at?: string | null
          end_date?: string | null
          framework_id?: string
          id?: string
          is_activated?: boolean | null
          primary_objective?: string
          start_date?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "framework_versions_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "performance_frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          autonomy_mode_at_assignment: Database["public"]["Enums"]["autonomy_mode"]
          candidate_id: string | null
          completed_at: string | null
          escalation_stage_at_assignment: number
          execution_action_id: string
          id: string
          library_item_id: string
          player_id: string
          player_notes: string | null
          status: Database["public"]["Enums"]["intervention_status"]
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          autonomy_mode_at_assignment: Database["public"]["Enums"]["autonomy_mode"]
          candidate_id?: string | null
          completed_at?: string | null
          escalation_stage_at_assignment: number
          execution_action_id: string
          id?: string
          library_item_id: string
          player_id: string
          player_notes?: string | null
          status?: Database["public"]["Enums"]["intervention_status"]
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          autonomy_mode_at_assignment?: Database["public"]["Enums"]["autonomy_mode"]
          candidate_id?: string | null
          completed_at?: string | null
          escalation_stage_at_assignment?: number
          execution_action_id?: string
          id?: string
          library_item_id?: string
          player_id?: string
          player_notes?: string | null
          status?: Database["public"]["Enums"]["intervention_status"]
        }
        Relationships: [
          {
            foreignKeyName: "intervention_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intervention_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_assignments_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "intervention_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_assignments_execution_action_id_fkey"
            columns: ["execution_action_id"]
            isOneToOne: false
            referencedRelation: "execution_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_assignments_library_item_id_fkey"
            columns: ["library_item_id"]
            isOneToOne: false
            referencedRelation: "intervention_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intervention_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_candidates: {
        Row: {
          backlog_priority: number | null
          created_at: string | null
          escalation_stage: number
          execution_action_id: string
          id: string
          is_critical_bypass: boolean | null
          library_item_id: string | null
          player_id: string
          policy_id: string
          status: string
        }
        Insert: {
          backlog_priority?: number | null
          created_at?: string | null
          escalation_stage: number
          execution_action_id: string
          id?: string
          is_critical_bypass?: boolean | null
          library_item_id?: string | null
          player_id: string
          policy_id: string
          status?: string
        }
        Update: {
          backlog_priority?: number | null
          created_at?: string | null
          escalation_stage?: number
          execution_action_id?: string
          id?: string
          is_critical_bypass?: boolean | null
          library_item_id?: string | null
          player_id?: string
          policy_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "intervention_candidates_execution_action_id_fkey"
            columns: ["execution_action_id"]
            isOneToOne: false
            referencedRelation: "execution_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_candidates_library_item_id_fkey"
            columns: ["library_item_id"]
            isOneToOne: false
            referencedRelation: "intervention_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_candidates_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intervention_candidates_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_candidates_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "intervention_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_effectiveness_reviews: {
        Row: {
          assignment_id: string
          coach_id: string
          created_at: string | null
          effectiveness_rating: string
          id: string
          notes: string | null
        }
        Insert: {
          assignment_id: string
          coach_id: string
          created_at?: string | null
          effectiveness_rating: string
          id?: string
          notes?: string | null
        }
        Update: {
          assignment_id?: string
          coach_id?: string
          created_at?: string | null
          effectiveness_rating?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intervention_effectiveness_reviews_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "intervention_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_effectiveness_reviews_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intervention_effectiveness_reviews_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_library: {
        Row: {
          coach_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean
          min_escalation_stage: number
          name: string
          requirements: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          min_escalation_stage?: number
          name: string
          requirements?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          min_escalation_stage?: number
          name?: string
          requirements?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intervention_library_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intervention_library_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_policies: {
        Row: {
          autonomy_mode: Database["public"]["Enums"]["autonomy_mode"]
          coach_id: string
          concurrency_cap: number
          cooldown_hours: number
          id: string
          severity_tier: Database["public"]["Enums"]["severity_type"]
        }
        Insert: {
          autonomy_mode?: Database["public"]["Enums"]["autonomy_mode"]
          coach_id: string
          concurrency_cap: number
          cooldown_hours: number
          id?: string
          severity_tier: Database["public"]["Enums"]["severity_type"]
        }
        Update: {
          autonomy_mode?: Database["public"]["Enums"]["autonomy_mode"]
          coach_id?: string
          concurrency_cap?: number
          cooldown_hours?: number
          id?: string
          severity_tier?: Database["public"]["Enums"]["severity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "intervention_policies_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "intervention_policies_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_frameworks: {
        Row: {
          coach_id: string
          id: string
          status: Database["public"]["Enums"]["framework_status"]
        }
        Insert: {
          coach_id: string
          id?: string
          status?: Database["public"]["Enums"]["framework_status"]
        }
        Update: {
          coach_id?: string
          id?: string
          status?: Database["public"]["Enums"]["framework_status"]
        }
        Relationships: [
          {
            foreignKeyName: "performance_frameworks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "performance_frameworks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_accountability_profiles: {
        Row: {
          aversions: Json | null
          boundaries: string | null
          coach_notes: string | null
          id: string
          ineffective_past: Json | null
          motivators: Json | null
          player_id: string
          preferred_methods: Json | null
          prohibited_types: Json | null
          updated_at: string | null
        }
        Insert: {
          aversions?: Json | null
          boundaries?: string | null
          coach_notes?: string | null
          id?: string
          ineffective_past?: Json | null
          motivators?: Json | null
          player_id: string
          preferred_methods?: Json | null
          prohibited_types?: Json | null
          updated_at?: string | null
        }
        Update: {
          aversions?: Json | null
          boundaries?: string | null
          coach_notes?: string | null
          id?: string
          ineffective_past?: Json | null
          motivators?: Json | null
          player_id?: string
          preferred_methods?: Json | null
          prohibited_types?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_accountability_profiles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_accountability_profiles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poker_week_boundary_configs: {
        Row: {
          boundary_day_of_week: number
          boundary_time: string
          coach_id: string
          created_at: string | null
          id: string
          is_active: boolean
          poker_day_boundary_time: string
        }
        Insert: {
          boundary_day_of_week?: number
          boundary_time?: string
          coach_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          poker_day_boundary_time?: string
        }
        Update: {
          boundary_day_of_week?: number
          boundary_time?: string
          coach_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          poker_day_boundary_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "poker_week_boundary_configs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "poker_week_boundary_configs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poker_weeks: {
        Row: {
          boundary_config_id: string | null
          end_timestamp: string
          id: string
          is_finalized: boolean | null
          player_id: string
          player_timezone_snapshot: string
          start_timestamp: string
        }
        Insert: {
          boundary_config_id?: string | null
          end_timestamp: string
          id?: string
          is_finalized?: boolean | null
          player_id: string
          player_timezone_snapshot: string
          start_timestamp: string
        }
        Update: {
          boundary_config_id?: string | null
          end_timestamp?: string
          id?: string
          is_finalized?: boolean | null
          player_id?: string
          player_timezone_snapshot?: string
          start_timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "poker_weeks_boundary_config_id_fkey"
            columns: ["boundary_config_id"]
            isOneToOne: false
            referencedRelation: "poker_week_boundary_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poker_weeks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "poker_weeks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      preparation_records: {
        Row: {
          created_at: string | null
          id: string
          impulse_control_pmo: boolean | null
          impulse_control_recovery: boolean | null
          impulse_control_smoking: boolean | null
          medal_tier: Database["public"]["Enums"]["medal_type"]
          meditation_minutes: number | null
          mental_priming: boolean | null
          optional_note: string | null
          physical_readiness: string | null
          player_id: string
          pre_game_ritual_completed: boolean | null
          ritual_identity_line: string | null
          ritual_intent: string | null
          ritual_process_definition: string | null
          rule_version_id: string
          sleep_hours: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          impulse_control_pmo?: boolean | null
          impulse_control_recovery?: boolean | null
          impulse_control_smoking?: boolean | null
          medal_tier?: Database["public"]["Enums"]["medal_type"]
          meditation_minutes?: number | null
          mental_priming?: boolean | null
          optional_note?: string | null
          physical_readiness?: string | null
          player_id: string
          pre_game_ritual_completed?: boolean | null
          ritual_identity_line?: string | null
          ritual_intent?: string | null
          ritual_process_definition?: string | null
          rule_version_id: string
          sleep_hours?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          impulse_control_pmo?: boolean | null
          impulse_control_recovery?: boolean | null
          impulse_control_smoking?: boolean | null
          medal_tier?: Database["public"]["Enums"]["medal_type"]
          meditation_minutes?: number | null
          mental_priming?: boolean | null
          optional_note?: string | null
          physical_readiness?: string | null
          player_id?: string
          pre_game_ritual_completed?: boolean | null
          ritual_identity_line?: string | null
          ritual_intent?: string | null
          ritual_process_definition?: string | null
          rule_version_id?: string
          sleep_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "preparation_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "preparation_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preparation_records_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "preparation_rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      preparation_rule_sets: {
        Row: {
          coach_id: string
          id: string
        }
        Insert: {
          coach_id: string
          id?: string
        }
        Update: {
          coach_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preparation_rule_sets_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "preparation_rule_sets_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      preparation_rule_versions: {
        Row: {
          id: string
          is_activated: boolean | null
          rule_set_id: string
          version_number: number
        }
        Insert: {
          id?: string
          is_activated?: boolean | null
          rule_set_id: string
          version_number: number
        }
        Update: {
          id?: string
          is_activated?: boolean | null
          rule_set_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "preparation_rule_versions_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "preparation_rule_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      preparation_rules: {
        Row: {
          id: string
          is_required: boolean | null
          medal_impact: Database["public"]["Enums"]["medal_type"] | null
          operator: string
          rule_order: number
          signal_type: string
          threshold_value: number
          version_id: string
        }
        Insert: {
          id?: string
          is_required?: boolean | null
          medal_impact?: Database["public"]["Enums"]["medal_type"] | null
          operator: string
          rule_order: number
          signal_type: string
          threshold_value: number
          version_id: string
        }
        Update: {
          id?: string
          is_required?: boolean | null
          medal_impact?: Database["public"]["Enums"]["medal_type"] | null
          operator?: string
          rule_order?: number
          signal_type?: string
          threshold_value?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preparation_rules_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "preparation_rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          coach_id: string | null
          created_at: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["role_type"]
          timezone: string
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          email: string
          id: string
          role?: Database["public"]["Enums"]["role_type"]
          timezone?: string
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["role_type"]
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_contract_conditional_tournaments: {
        Row: {
          activation_condition: string
          id: string
          permitted_buy_ins: number
          session_contract_id: string
          source_wgp_conditional_id: string | null
          tournament_name: string
        }
        Insert: {
          activation_condition: string
          id?: string
          permitted_buy_ins: number
          session_contract_id: string
          source_wgp_conditional_id?: string | null
          tournament_name: string
        }
        Update: {
          activation_condition?: string
          id?: string
          permitted_buy_ins?: number
          session_contract_id?: string
          source_wgp_conditional_id?: string | null
          tournament_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_contract_conditional_tou_source_wgp_conditional_id_fkey"
            columns: ["source_wgp_conditional_id"]
            isOneToOne: false
            referencedRelation: "weekly_game_plan_conditional_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_contract_conditional_tournamen_session_contract_id_fkey"
            columns: ["session_contract_id"]
            isOneToOne: false
            referencedRelation: "session_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      session_contract_substitutions: {
        Row: {
          created_at: string | null
          id: string
          original_slot_id: string | null
          passed_brm_validation: boolean
          reason: string
          replacement_permitted_buy_ins: number
          replacement_tournament_name: string
          session_contract_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          original_slot_id?: string | null
          passed_brm_validation: boolean
          reason: string
          replacement_permitted_buy_ins: number
          replacement_tournament_name: string
          session_contract_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          original_slot_id?: string | null
          passed_brm_validation?: boolean
          reason?: string
          replacement_permitted_buy_ins?: number
          replacement_tournament_name?: string
          session_contract_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_contract_substitutions_original_slot_id_fkey"
            columns: ["original_slot_id"]
            isOneToOne: false
            referencedRelation: "session_contract_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_contract_substitutions_session_contract_id_fkey"
            columns: ["session_contract_id"]
            isOneToOne: false
            referencedRelation: "session_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      session_contract_tournaments: {
        Row: {
          created_at: string | null
          id: string
          permitted_buy_ins: number
          session_contract_id: string
          slot_number: number
          source_wgp_tournament_id: string | null
          tournament_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          permitted_buy_ins: number
          session_contract_id: string
          slot_number: number
          source_wgp_tournament_id?: string | null
          tournament_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          permitted_buy_ins?: number
          session_contract_id?: string
          slot_number?: number
          source_wgp_tournament_id?: string | null
          tournament_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_contract_tournaments_session_contract_id_fkey"
            columns: ["session_contract_id"]
            isOneToOne: false
            referencedRelation: "session_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_contract_tournaments_source_wgp_tournament_id_fkey"
            columns: ["source_wgp_tournament_id"]
            isOneToOne: false
            referencedRelation: "weekly_game_plan_tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      session_contracts: {
        Row: {
          brm_assignment_id: string
          effective_session_loss_limit_at_creation: number
          framework_version_id: string
          id: string
          locked_at: string | null
          player_id: string
          remaining_day_capacity_snapshot: number | null
          remaining_week_capacity_snapshot: number | null
          session_intention: string | null
          session_stop_loss: number
          status: Database["public"]["Enums"]["contract_status"]
          weekly_game_plan_id: string
        }
        Insert: {
          brm_assignment_id: string
          effective_session_loss_limit_at_creation: number
          framework_version_id: string
          id?: string
          locked_at?: string | null
          player_id: string
          remaining_day_capacity_snapshot?: number | null
          remaining_week_capacity_snapshot?: number | null
          session_intention?: string | null
          session_stop_loss: number
          status?: Database["public"]["Enums"]["contract_status"]
          weekly_game_plan_id: string
        }
        Update: {
          brm_assignment_id?: string
          effective_session_loss_limit_at_creation?: number
          framework_version_id?: string
          id?: string
          locked_at?: string | null
          player_id?: string
          remaining_day_capacity_snapshot?: number | null
          remaining_week_capacity_snapshot?: number | null
          session_intention?: string | null
          session_stop_loss?: number
          status?: Database["public"]["Enums"]["contract_status"]
          weekly_game_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_contracts_brm_assignment_id_fkey"
            columns: ["brm_assignment_id"]
            isOneToOne: false
            referencedRelation: "weekly_brm_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_contracts_framework_version_id_fkey"
            columns: ["framework_version_id"]
            isOneToOne: false
            referencedRelation: "framework_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_contracts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "session_contracts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_contracts_weekly_game_plan_id_fkey"
            columns: ["weekly_game_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_game_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      session_execution_assessments: {
        Row: {
          created_at: string | null
          final_execution_medal: Database["public"]["Enums"]["medal_type"]
          hard_gate_triggered: boolean | null
          id: string
          is_current: boolean | null
          revision_number: number
          session_id: string
          supersedes_id: string | null
          system_execution_medal: Database["public"]["Enums"]["medal_type"]
          taxonomy_version_id: string
        }
        Insert: {
          created_at?: string | null
          final_execution_medal: Database["public"]["Enums"]["medal_type"]
          hard_gate_triggered?: boolean | null
          id?: string
          is_current?: boolean | null
          revision_number?: number
          session_id: string
          supersedes_id?: string | null
          system_execution_medal: Database["public"]["Enums"]["medal_type"]
          taxonomy_version_id: string
        }
        Update: {
          created_at?: string | null
          final_execution_medal?: Database["public"]["Enums"]["medal_type"]
          hard_gate_triggered?: boolean | null
          id?: string
          is_current?: boolean | null
          revision_number?: number
          session_id?: string
          supersedes_id?: string | null
          system_execution_medal?: Database["public"]["Enums"]["medal_type"]
          taxonomy_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_execution_assessments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_execution_assessments_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "session_execution_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_execution_assessments_taxonomy_version_id_fkey"
            columns: ["taxonomy_version_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_execution_dimension_assessments: {
        Row: {
          assessment_id: string
          dimension: Database["public"]["Enums"]["dimension_type"]
          final_rating: string
          id: string
          system_rating: string
        }
        Insert: {
          assessment_id: string
          dimension: Database["public"]["Enums"]["dimension_type"]
          final_rating: string
          id?: string
          system_rating: string
        }
        Update: {
          assessment_id?: string
          dimension?: Database["public"]["Enums"]["dimension_type"]
          final_rating?: string
          id?: string
          system_rating?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_execution_dimension_assessments_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "session_execution_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      session_outcome_assessments: {
        Row: {
          brm_compliance: boolean | null
          created_at: string | null
          final_session_net_pnl: number
          hard_gate_triggered: boolean | null
          id: string
          is_current: boolean | null
          revision_number: number
          rule_version_id: string
          session_id: string
          supersedes_id: string | null
          system_outcome_medal: Database["public"]["Enums"]["medal_type"]
        }
        Insert: {
          brm_compliance?: boolean | null
          created_at?: string | null
          final_session_net_pnl: number
          hard_gate_triggered?: boolean | null
          id?: string
          is_current?: boolean | null
          revision_number?: number
          rule_version_id: string
          session_id: string
          supersedes_id?: string | null
          system_outcome_medal: Database["public"]["Enums"]["medal_type"]
        }
        Update: {
          brm_compliance?: boolean | null
          created_at?: string | null
          final_session_net_pnl?: number
          hard_gate_triggered?: boolean | null
          id?: string
          is_current?: boolean | null
          revision_number?: number
          rule_version_id?: string
          session_id?: string
          supersedes_id?: string | null
          system_outcome_medal?: Database["public"]["Enums"]["medal_type"]
        }
        Relationships: [
          {
            foreignKeyName: "session_outcome_assessments_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "brm_config_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_outcome_assessments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_outcome_assessments_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "session_outcome_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          contract_id: string
          end_time: string | null
          execution_medal: Database["public"]["Enums"]["medal_type"] | null
          id: string
          outcome_medal: Database["public"]["Enums"]["medal_type"] | null
          player_id: string
          preparation_id: string | null
          reflection_note: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["session_status"]
        }
        Insert: {
          contract_id: string
          end_time?: string | null
          execution_medal?: Database["public"]["Enums"]["medal_type"] | null
          id?: string
          outcome_medal?: Database["public"]["Enums"]["medal_type"] | null
          player_id: string
          preparation_id?: string | null
          reflection_note?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["session_status"]
        }
        Update: {
          contract_id?: string
          end_time?: string | null
          execution_medal?: Database["public"]["Enums"]["medal_type"] | null
          id?: string
          outcome_medal?: Database["public"]["Enums"]["medal_type"] | null
          player_id?: string
          preparation_id?: string | null
          reflection_note?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["session_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sessions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "session_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_preparation_id_fkey"
            columns: ["preparation_id"]
            isOneToOne: false
            referencedRelation: "preparation_records"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomy_versions: {
        Row: {
          id: string
          is_activated: boolean | null
          taxonomy_id: string
          version_number: number
        }
        Insert: {
          id?: string
          is_activated?: boolean | null
          taxonomy_id: string
          version_number: number
        }
        Update: {
          id?: string
          is_activated?: boolean | null
          taxonomy_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_versions_taxonomy_id_fkey"
            columns: ["taxonomy_id"]
            isOneToOne: false
            referencedRelation: "execution_taxonomies"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_entries: {
        Row: {
          buy_in_amount: number
          completion_timestamp: string | null
          created_at: string | null
          entry_sequence: number
          id: string
          investment: number | null
          return_amount: number
          status: Database["public"]["Enums"]["entry_status"]
          tournament_id: string
        }
        Insert: {
          buy_in_amount: number
          completion_timestamp?: string | null
          created_at?: string | null
          entry_sequence: number
          id?: string
          investment?: number | null
          return_amount?: number
          status?: Database["public"]["Enums"]["entry_status"]
          tournament_id: string
        }
        Update: {
          buy_in_amount?: number
          completion_timestamp?: string | null
          created_at?: string | null
          entry_sequence?: number
          id?: string
          investment?: number | null
          return_amount?: number
          status?: Database["public"]["Enums"]["entry_status"]
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_entries_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_mistakes: {
        Row: {
          execution_action_occurrence_id: string
          id: string
          tournament_id: string
        }
        Insert: {
          execution_action_occurrence_id: string
          id?: string
          tournament_id: string
        }
        Update: {
          execution_action_occurrence_id?: string
          id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_mistakes_execution_action_occurrence_id_fkey"
            columns: ["execution_action_occurrence_id"]
            isOneToOne: false
            referencedRelation: "execution_action_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_mistakes_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          best_rank: number | null
          comments: string | null
          final_table_yn: boolean | null
          id: string
          is_unauthorized: boolean | null
          is_unplanned: boolean | null
          itm_yn: boolean | null
          name: string
          net_return: number | null
          session_id: string
          tournament_number: string | null
          winnings_gross: number | null
          worst_rank: number | null
        }
        Insert: {
          best_rank?: number | null
          comments?: string | null
          final_table_yn?: boolean | null
          id?: string
          is_unauthorized?: boolean | null
          is_unplanned?: boolean | null
          itm_yn?: boolean | null
          name: string
          net_return?: number | null
          session_id: string
          tournament_number?: string | null
          winnings_gross?: number | null
          worst_rank?: number | null
        }
        Update: {
          best_rank?: number | null
          comments?: string | null
          final_table_yn?: boolean | null
          id?: string
          is_unauthorized?: boolean | null
          is_unplanned?: boolean | null
          itm_yn?: boolean | null
          name?: string
          net_return?: number | null
          session_id?: string
          tournament_number?: string | null
          winnings_gross?: number | null
          worst_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      verdict_evidence_items: {
        Row: {
          claim_text: string
          confidence_level: string
          created_at: string | null
          evidence_entity_id: string
          evidence_entity_type: string
          id: string
          section: string
          verdict_id: string
        }
        Insert: {
          claim_text: string
          confidence_level: string
          created_at?: string | null
          evidence_entity_id: string
          evidence_entity_type: string
          id?: string
          section: string
          verdict_id: string
        }
        Update: {
          claim_text?: string
          confidence_level?: string
          created_at?: string | null
          evidence_entity_id?: string
          evidence_entity_type?: string
          id?: string
          section?: string
          verdict_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verdict_evidence_items_verdict_id_fkey"
            columns: ["verdict_id"]
            isOneToOne: false
            referencedRelation: "verdicts"
            referencedColumns: ["id"]
          },
        ]
      }
      verdict_generation_context: {
        Row: {
          behavioral_snapshot_id: string | null
          brm_assignment_id: string
          coaching_priorities_snapshot: Json | null
          created_at: string | null
          execution_assessment_id: string
          framework_version_id: string
          id: string
          outcome_assessment_id: string
          prep_record_id: string | null
          verdict_id: string
        }
        Insert: {
          behavioral_snapshot_id?: string | null
          brm_assignment_id: string
          coaching_priorities_snapshot?: Json | null
          created_at?: string | null
          execution_assessment_id: string
          framework_version_id: string
          id?: string
          outcome_assessment_id: string
          prep_record_id?: string | null
          verdict_id: string
        }
        Update: {
          behavioral_snapshot_id?: string | null
          brm_assignment_id?: string
          coaching_priorities_snapshot?: Json | null
          created_at?: string | null
          execution_assessment_id?: string
          framework_version_id?: string
          id?: string
          outcome_assessment_id?: string
          prep_record_id?: string | null
          verdict_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verdict_generation_context_behavioral_snapshot_id_fkey"
            columns: ["behavioral_snapshot_id"]
            isOneToOne: false
            referencedRelation: "behavioral_profile_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verdict_generation_context_brm_assignment_id_fkey"
            columns: ["brm_assignment_id"]
            isOneToOne: false
            referencedRelation: "weekly_brm_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verdict_generation_context_execution_assessment_id_fkey"
            columns: ["execution_assessment_id"]
            isOneToOne: false
            referencedRelation: "session_execution_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verdict_generation_context_framework_version_id_fkey"
            columns: ["framework_version_id"]
            isOneToOne: false
            referencedRelation: "framework_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verdict_generation_context_outcome_assessment_id_fkey"
            columns: ["outcome_assessment_id"]
            isOneToOne: false
            referencedRelation: "session_outcome_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verdict_generation_context_prep_record_id_fkey"
            columns: ["prep_record_id"]
            isOneToOne: false
            referencedRelation: "preparation_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verdict_generation_context_verdict_id_fkey"
            columns: ["verdict_id"]
            isOneToOne: false
            referencedRelation: "verdicts"
            referencedColumns: ["id"]
          },
        ]
      }
      verdicts: {
        Row: {
          classification: Database["public"]["Enums"]["verdict_classification"]
          created_at: string | null
          headline: string
          id: string
          is_current: boolean | null
          reflection_prose: string | null
          revision_number: number
          session_id: string
          supersedes_id: string | null
        }
        Insert: {
          classification: Database["public"]["Enums"]["verdict_classification"]
          created_at?: string | null
          headline: string
          id?: string
          is_current?: boolean | null
          reflection_prose?: string | null
          revision_number?: number
          session_id: string
          supersedes_id?: string | null
        }
        Update: {
          classification?: Database["public"]["Enums"]["verdict_classification"]
          created_at?: string | null
          headline?: string
          id?: string
          is_current?: boolean | null
          reflection_prose?: string | null
          revision_number?: number
          session_id?: string
          supersedes_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verdicts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verdicts_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "verdicts"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_brm_assignments: {
        Row: {
          bankroll_balance_at_assignment: number
          bankroll_band_id: string
          brm_config_version_id: string
          brm_level_id: string
          change_reason: string | null
          day_stop_loss_snapshot: number
          id: string
          locked_at: string | null
          opening_capital_at_assignment: number
          player_id: string
          poker_week_id: string
          session_stop_loss_snapshot: number
          week_stop_loss_snapshot: number
        }
        Insert: {
          bankroll_balance_at_assignment: number
          bankroll_band_id: string
          brm_config_version_id: string
          brm_level_id: string
          change_reason?: string | null
          day_stop_loss_snapshot: number
          id?: string
          locked_at?: string | null
          opening_capital_at_assignment: number
          player_id: string
          poker_week_id: string
          session_stop_loss_snapshot: number
          week_stop_loss_snapshot: number
        }
        Update: {
          bankroll_balance_at_assignment?: number
          bankroll_band_id?: string
          brm_config_version_id?: string
          brm_level_id?: string
          change_reason?: string | null
          day_stop_loss_snapshot?: number
          id?: string
          locked_at?: string | null
          opening_capital_at_assignment?: number
          player_id?: string
          poker_week_id?: string
          session_stop_loss_snapshot?: number
          week_stop_loss_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_brm_assignments_bankroll_band_id_fkey"
            columns: ["bankroll_band_id"]
            isOneToOne: false
            referencedRelation: "brm_bankroll_bands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_brm_assignments_brm_config_version_id_fkey"
            columns: ["brm_config_version_id"]
            isOneToOne: false
            referencedRelation: "brm_config_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_brm_assignments_brm_level_id_fkey"
            columns: ["brm_level_id"]
            isOneToOne: false
            referencedRelation: "brm_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_brm_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "weekly_brm_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_brm_assignments_poker_week_id_fkey"
            columns: ["poker_week_id"]
            isOneToOne: false
            referencedRelation: "poker_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_game_plan_amendments: {
        Row: {
          amendment_type: string
          created_at: string | null
          id: string
          is_violation: boolean
          original_reference: Json | null
          player_id: string
          proposed_new_value: Json | null
          reason: string
          related_execution_action_id: string | null
          validation_result: Json | null
          weekly_game_plan_id: string
        }
        Insert: {
          amendment_type: string
          created_at?: string | null
          id?: string
          is_violation?: boolean
          original_reference?: Json | null
          player_id: string
          proposed_new_value?: Json | null
          reason: string
          related_execution_action_id?: string | null
          validation_result?: Json | null
          weekly_game_plan_id: string
        }
        Update: {
          amendment_type?: string
          created_at?: string | null
          id?: string
          is_violation?: boolean
          original_reference?: Json | null
          player_id?: string
          proposed_new_value?: Json | null
          reason?: string
          related_execution_action_id?: string | null
          validation_result?: Json | null
          weekly_game_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_game_plan_amendments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "weekly_game_plan_amendments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_game_plan_amendments_related_execution_action_id_fkey"
            columns: ["related_execution_action_id"]
            isOneToOne: false
            referencedRelation: "execution_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_game_plan_amendments_weekly_game_plan_id_fkey"
            columns: ["weekly_game_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_game_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_game_plan_commitments: {
        Row: {
          commitment_text: string
          created_at: string | null
          id: string
          weekly_game_plan_id: string
        }
        Insert: {
          commitment_text: string
          created_at?: string | null
          id?: string
          weekly_game_plan_id: string
        }
        Update: {
          commitment_text?: string
          created_at?: string | null
          id?: string
          weekly_game_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_game_plan_commitments_weekly_game_plan_id_fkey"
            columns: ["weekly_game_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_game_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_game_plan_conditional_tournaments: {
        Row: {
          activation_condition: string
          created_at: string | null
          id: string
          permitted_buy_ins: number
          tournament_name: string
          weekly_game_plan_id: string
        }
        Insert: {
          activation_condition: string
          created_at?: string | null
          id?: string
          permitted_buy_ins: number
          tournament_name: string
          weekly_game_plan_id: string
        }
        Update: {
          activation_condition?: string
          created_at?: string | null
          id?: string
          permitted_buy_ins?: number
          tournament_name?: string
          weekly_game_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_game_plan_conditional_tournamen_weekly_game_plan_id_fkey"
            columns: ["weekly_game_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_game_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_game_plan_playing_days: {
        Row: {
          id: string
          planned_date: string
          planned_session_allocation: number
          weekly_game_plan_id: string
        }
        Insert: {
          id?: string
          planned_date: string
          planned_session_allocation?: number
          weekly_game_plan_id: string
        }
        Update: {
          id?: string
          planned_date?: string
          planned_session_allocation?: number
          weekly_game_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_game_plan_playing_days_weekly_game_plan_id_fkey"
            columns: ["weekly_game_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_game_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_game_plan_tournaments: {
        Row: {
          created_at: string | null
          id: string
          intended_buy_ins: number
          permitted_buy_ins: number
          planned_date: string | null
          slot_number: number
          tournament_name: string
          weekly_game_plan_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          intended_buy_ins: number
          permitted_buy_ins: number
          planned_date?: string | null
          slot_number: number
          tournament_name: string
          weekly_game_plan_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          intended_buy_ins?: number
          permitted_buy_ins?: number
          planned_date?: string | null
          slot_number?: number
          tournament_name?: string
          weekly_game_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_game_plan_tournaments_weekly_game_plan_id_fkey"
            columns: ["weekly_game_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_game_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_game_plans: {
        Row: {
          brm_assignment_id: string | null
          created_at: string | null
          framework_version_id: string | null
          id: string
          locked_at: string | null
          player_id: string
          poker_week_id: string
          status: Database["public"]["Enums"]["wgp_status"]
          weekly_focus: string | null
          weekly_intention: string | null
        }
        Insert: {
          brm_assignment_id?: string | null
          created_at?: string | null
          framework_version_id?: string | null
          id?: string
          locked_at?: string | null
          player_id: string
          poker_week_id: string
          status?: Database["public"]["Enums"]["wgp_status"]
          weekly_focus?: string | null
          weekly_intention?: string | null
        }
        Update: {
          brm_assignment_id?: string | null
          created_at?: string | null
          framework_version_id?: string | null
          id?: string
          locked_at?: string | null
          player_id?: string
          poker_week_id?: string
          status?: Database["public"]["Enums"]["wgp_status"]
          weekly_focus?: string | null
          weekly_intention?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_game_plans_brm_assignment_id_fkey"
            columns: ["brm_assignment_id"]
            isOneToOne: false
            referencedRelation: "weekly_brm_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_game_plans_framework_version_id_fkey"
            columns: ["framework_version_id"]
            isOneToOne: false
            referencedRelation: "framework_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_game_plans_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_current_bankroll"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "weekly_game_plans_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_game_plans_poker_week_id_fkey"
            columns: ["poker_week_id"]
            isOneToOne: false
            referencedRelation: "poker_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      player_current_bankroll: {
        Row: {
          current_bankroll: number | null
          player_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      fn_get_accountability_profile: {
        Args: { target_player_id: string }
        Returns: {
          aversions: Json | null
          boundaries: string | null
          coach_notes: string | null
          id: string
          ineffective_past: Json | null
          motivators: Json | null
          player_id: string
          preferred_methods: Json | null
          prohibited_types: Json | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "player_accountability_profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fn_is_coach_of: { Args: { target_player_id: string }; Returns: boolean }
      perform_end_session: {
        Args: {
          p_behavioral_snapshot_id?: string
          p_mistake_tags: Json
          p_reflection_note?: string
          p_reflection_prose?: string
          p_session_id: string
          p_tournament_finishes: Json
          p_verdict_evidence: Json
        }
        Returns: Json
      }
      perform_start_session: {
        Args: { p_contract_id: string; p_preparation_id?: string }
        Returns: Json
      }
    }
    Enums: {
      autonomy_mode: "RECOMMEND_ONLY" | "AUTO_ASSIGN"
      brief_validation: "AGREE" | "PARTIALLY_AGREE" | "DISAGREE"
      brm_status: "DRAFT" | "ACTIVE" | "ARCHIVED"
      contract_status: "DRAFT" | "VALIDATED" | "LOCKED"
      dimension_type:
        | "DISCIPLINE_PROCESS"
        | "TECHNICAL_PLAY"
        | "MENTAL_GAME"
        | "LEARNING_IMPROVEMENT"
        | "PREPARATION"
        | "OUTCOMES"
      entry_status: "COMPLETED" | "VOID" | "NON_COMPLIANT"
      execution_action_status:
        | "PLAYER_PROPOSED"
        | "COACH_APPROVED"
        | "CANONICAL_ACTIVE"
        | "INACTIVE"
      framework_status: "DRAFT" | "ACTIVE" | "ARCHIVED"
      intervention_status: "ASSIGNED" | "COMPLETED" | "CANCELLED"
      ledger_entry_type:
        | "OPENING_CAPITAL"
        | "DEPOSIT"
        | "WITHDRAWAL"
        | "ADJUSTMENT"
      medal_type: "GOLD" | "SILVER" | "BRONZE" | "NONE"
      review_status: "LOCKED" | "DRAFT"
      role_type: "PLAYER" | "COACH"
      sender_type: "PLAYER" | "AI" | "SYSTEM"
      session_status: "ACTIVE" | "REVIEW_PENDING" | "FINALIZED"
      severity_type: "MINOR" | "MAJOR" | "CRITICAL"
      verdict_classification:
        | "PROFESSIONAL_WIN"
        | "PROFESSIONAL_LOSS"
        | "LUCKY_ESCAPE"
        | "DESERVED_LOSS"
        | "MIXED_SESSION"
        | "INSUFFICIENT_EVIDENCE"
      wgp_status: "DRAFT" | "LOCKED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      autonomy_mode: ["RECOMMEND_ONLY", "AUTO_ASSIGN"],
      brief_validation: ["AGREE", "PARTIALLY_AGREE", "DISAGREE"],
      brm_status: ["DRAFT", "ACTIVE", "ARCHIVED"],
      contract_status: ["DRAFT", "VALIDATED", "LOCKED"],
      dimension_type: [
        "DISCIPLINE_PROCESS",
        "TECHNICAL_PLAY",
        "MENTAL_GAME",
        "LEARNING_IMPROVEMENT",
        "PREPARATION",
        "OUTCOMES",
      ],
      entry_status: ["COMPLETED", "VOID", "NON_COMPLIANT"],
      execution_action_status: [
        "PLAYER_PROPOSED",
        "COACH_APPROVED",
        "CANONICAL_ACTIVE",
        "INACTIVE",
      ],
      framework_status: ["DRAFT", "ACTIVE", "ARCHIVED"],
      intervention_status: ["ASSIGNED", "COMPLETED", "CANCELLED"],
      ledger_entry_type: [
        "OPENING_CAPITAL",
        "DEPOSIT",
        "WITHDRAWAL",
        "ADJUSTMENT",
      ],
      medal_type: ["GOLD", "SILVER", "BRONZE", "NONE"],
      review_status: ["LOCKED", "DRAFT"],
      role_type: ["PLAYER", "COACH"],
      sender_type: ["PLAYER", "AI", "SYSTEM"],
      session_status: ["ACTIVE", "REVIEW_PENDING", "FINALIZED"],
      severity_type: ["MINOR", "MAJOR", "CRITICAL"],
      verdict_classification: [
        "PROFESSIONAL_WIN",
        "PROFESSIONAL_LOSS",
        "LUCKY_ESCAPE",
        "DESERVED_LOSS",
        "MIXED_SESSION",
        "INSUFFICIENT_EVIDENCE",
      ],
      wgp_status: ["DRAFT", "LOCKED"],
    },
  },
} as const
