-- Backfill: execution_actions.detection_method carried two different
-- formats for the same semantic values — upper-snake-case on older/seeded
-- rows ('SYSTEM_DETECTED', 'PLAYER_TAGGED') vs. the hyphenated form
-- TaxonomyConfigView.tsx's Detection Method dropdown actually writes
-- ('System-detected', 'Player-tagged', 'System-derived', 'Coach-reviewed').
--
-- This caused two real bugs: (1) SessionReview.tsx's mistake-tagging step
-- was still offering "Unauthorized tournament" / "Exceeded permitted
-- buy-ins" / "Playing after Stop Loss" as manually-tappable, since its
-- exact-string comparison against the hyphenated form never matched the
-- upper-snake-case rows those three actually use; (2) opening one of the
-- affected rows in TaxonomyConfigView.tsx's edit form shows a value that
-- matches none of the <select>'s options.
--
-- SessionReview.tsx's own comparison was separately hardened to compare a
-- normalized form either way (see isSystemOnlyDetection), so this backfill
-- is about correctness of the stored data and the coach-facing edit form,
-- not a prerequisite for that fix.
UPDATE "public"."execution_actions" SET "detection_method" = 'System-detected' WHERE "detection_method" = 'SYSTEM_DETECTED';
UPDATE "public"."execution_actions" SET "detection_method" = 'Player-tagged' WHERE "detection_method" = 'PLAYER_TAGGED';
