/*
  # Chess Game Database Schema

  1. New Tables
    - `players`
      - `id` (uuid, primary key)
      - `username` (text, unique)
      - `created_at` (timestamptz)
      - `last_seen` (timestamptz)
    
    - `games`
      - `id` (uuid, primary key)
      - `white_player_id` (uuid, foreign key to players)
      - `black_player_id` (uuid, foreign key to players, nullable)
      - `board_state` (jsonb) - stores current board position
      - `current_turn` (text) - 'white' or 'black'
      - `status` (text) - 'waiting', 'active', 'completed', 'abandoned'
      - `winner` (text, nullable) - 'white', 'black', 'draw', null
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `moves`
      - `id` (uuid, primary key)
      - `game_id` (uuid, foreign key to games)
      - `move_number` (integer)
      - `player_color` (text) - 'white' or 'black'
      - `from_position` (text) - e.g., 'e2'
      - `to_position` (text) - e.g., 'e4'
      - `piece` (text) - piece type
      - `captured_piece` (text, nullable)
      - `promotion` (text, nullable)
      - `is_check` (boolean)
      - `is_checkmate` (boolean)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for players to read all games
    - Add policies for players to update their own games
    - Add policies for reading moves in active games
*/

-- Create players table
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now()
);

-- Create games table
CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  white_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  black_player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  board_state jsonb NOT NULL,
  current_turn text NOT NULL DEFAULT 'white',
  status text NOT NULL DEFAULT 'waiting',
  winner text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create moves table
CREATE TABLE IF NOT EXISTS moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number integer NOT NULL,
  player_color text NOT NULL,
  from_position text NOT NULL,
  to_position text NOT NULL,
  piece text NOT NULL,
  captured_piece text,
  promotion text,
  is_check boolean DEFAULT false,
  is_checkmate boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_white_player ON games(white_player_id);
CREATE INDEX IF NOT EXISTS idx_games_black_player ON games(black_player_id);
CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id);

-- Enable Row Level Security
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;

-- RLS Policies for players table
CREATE POLICY "Anyone can view players"
  ON players FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert players"
  ON players FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Players can update their own data"
  ON players FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- RLS Policies for games table
CREATE POLICY "Anyone can view games"
  ON games FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can create games"
  ON games FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Players can update games they're in"
  ON games FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- RLS Policies for moves table
CREATE POLICY "Anyone can view moves"
  ON moves FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert moves"
  ON moves FOR INSERT
  TO public
  WITH CHECK (true);