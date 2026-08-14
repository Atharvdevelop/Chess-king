-- Add time_format column to games table.
-- This column was used by ChallengeView.tsx and the initialize_open_match RPC
-- but was never added to the games table in the original migrations.
-- Run this in your Supabase SQL Editor.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'games'
      AND column_name  = 'time_format'
  ) THEN
    ALTER TABLE public.games ADD COLUMN time_format text;
  END IF;
END $$;
