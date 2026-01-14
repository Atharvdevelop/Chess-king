/*
  # Add Challenge System and Game Timers

  1. New Tables
    - `challenges`
      - `id` (uuid, primary key)
      - `challenger_id` (uuid, foreign key to players)
      - `challenged_id` (uuid, foreign key to players)
      - `status` (text) - 'pending', 'accepted', 'rejected'
      - `game_id` (uuid, nullable, foreign key to games)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Modified Tables
    - `games`
      - Add `time_limit` (integer) - total time in seconds
      - Add `white_time_remaining` (integer) - time in seconds
      - Add `black_time_remaining` (integer) - time in seconds
      - Add `last_move_at` (timestamptz) - for timer synchronization
      - Add `white_player_username` (text)
      - Add `black_player_username` (text)

  3. Security
    - Enable RLS on challenges table
    - Add policies for challenge operations
*/

-- Create challenges table
CREATE TABLE IF NOT EXISTS challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  challenged_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  game_id uuid REFERENCES games(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add columns to games table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'time_limit'
  ) THEN
    ALTER TABLE games ADD COLUMN time_limit integer DEFAULT 600;
    ALTER TABLE games ADD COLUMN white_time_remaining integer DEFAULT 600;
    ALTER TABLE games ADD COLUMN black_time_remaining integer DEFAULT 600;
    ALTER TABLE games ADD COLUMN last_move_at timestamptz DEFAULT now();
    ALTER TABLE games ADD COLUMN white_player_username text;
    ALTER TABLE games ADD COLUMN black_player_username text;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges(challenger_id);
CREATE INDEX IF NOT EXISTS idx_challenges_challenged ON challenges(challenged_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_game_id ON challenges(game_id);

-- Enable RLS
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

-- RLS Policies for challenges
CREATE POLICY "Anyone can view challenges"
  ON challenges FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can create challenges"
  ON challenges FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update challenges"
  ON challenges FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);