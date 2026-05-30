/*
  # Open Challenge Matchmaking

  1. New Tables
    - `matchmaking_queue`
      - `id`          (uuid, primary key)
      - `user_id`     (uuid, FK → auth.users)
      - `username`    (text)
      - `time_format` (text) e.g. "3+2", "10+0"
      - `game_id`     (uuid, nullable FK → games) — set by the RPC when a match is made;
                       the waiting client listens for this UPDATE to learn its game ID.
      - `created_at`  (timestamptz)

  2. New RPC
    - `initialize_open_match(p_queue_row_id, p_joiner_id, p_joiner_username, p_time_format)`
      Atomically:
        • Locks the waiting player's queue row (SKIP LOCKED prevents double-claims).
        • Creates an active `games` row with random colour assignment.
        • Stamps `game_id` on the queue row so the realtime listener fires for the waiter.
        • Returns the new game UUID to the joiner.

  3. Security
    - RLS enabled; authenticated users may insert their own row.
    - The RPC runs as SECURITY DEFINER so it can atomically update the queue row
      even when the caller is the joiner (not the owner of that row).
*/

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username    text        NOT NULL,
  time_format text        NOT NULL,
  game_id     uuid        REFERENCES public.games(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT NOW()
);

-- One open-challenge slot per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_one_per_user
  ON public.matchmaking_queue (user_id);

CREATE INDEX IF NOT EXISTS idx_queue_time_format
  ON public.matchmaking_queue (time_format);

CREATE INDEX IF NOT EXISTS idx_queue_game_id
  ON public.matchmaking_queue (game_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Queue is publicly readable"
  ON public.matchmaking_queue FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can join the queue"
  ON public.matchmaking_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave the queue"
  ON public.matchmaking_queue FOR DELETE
  USING (auth.uid() = user_id);

-- The RPC (SECURITY DEFINER) needs to UPDATE matched rows
CREATE POLICY "System can update queue rows"
  ON public.matchmaking_queue FOR UPDATE
  USING (true);

-- ── RPC ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.initialize_open_match(
  p_queue_row_id    uuid,   -- the waiting player's queue row to claim
  p_joiner_id       uuid,   -- the player who just clicked "Find Match"
  p_joiner_username text,
  p_time_format     text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue       RECORD;
  v_game_id     uuid;
  v_white_id    uuid;
  v_black_id    uuid;
  v_white_uname text;
  v_black_uname text;
  v_board       jsonb;
BEGIN
  -- 1. Lock the queue row atomically; SKIP LOCKED makes concurrent callers fail fast
  --    rather than queue behind each other (they'll fall through to insert themselves).
  SELECT *
  INTO   v_queue
  FROM   public.matchmaking_queue
  WHERE  id      = p_queue_row_id
    AND  game_id IS NULL       -- still unmatched
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_already_claimed: queue row % was already taken', p_queue_row_id;
  END IF;

  -- 2. Guard against self-match
  IF v_queue.user_id = p_joiner_id THEN
    RAISE EXCEPTION 'self_match_rejected: cannot pair with yourself';
  END IF;

  -- 3. Random colour assignment
  IF random() < 0.5 THEN
    v_white_id    := p_joiner_id;         v_white_uname := p_joiner_username;
    v_black_id    := v_queue.user_id;     v_black_uname := v_queue.username;
  ELSE
    v_white_id    := v_queue.user_id;     v_white_uname := v_queue.username;
    v_black_id    := p_joiner_id;         v_black_uname := p_joiner_username;
  END IF;

  -- 4. Standard starting board
  v_board := '{
    "a8":{"type":"rook","color":"black"},  "b8":{"type":"knight","color":"black"},
    "c8":{"type":"bishop","color":"black"},"d8":{"type":"queen","color":"black"},
    "e8":{"type":"king","color":"black"},  "f8":{"type":"bishop","color":"black"},
    "g8":{"type":"knight","color":"black"},"h8":{"type":"rook","color":"black"},
    "a7":{"type":"pawn","color":"black"},  "b7":{"type":"pawn","color":"black"},
    "c7":{"type":"pawn","color":"black"},  "d7":{"type":"pawn","color":"black"},
    "e7":{"type":"pawn","color":"black"},  "f7":{"type":"pawn","color":"black"},
    "g7":{"type":"pawn","color":"black"},  "h7":{"type":"pawn","color":"black"},
    "a2":{"type":"pawn","color":"white"},  "b2":{"type":"pawn","color":"white"},
    "c2":{"type":"pawn","color":"white"},  "d2":{"type":"pawn","color":"white"},
    "e2":{"type":"pawn","color":"white"},  "f2":{"type":"pawn","color":"white"},
    "g2":{"type":"pawn","color":"white"},  "h2":{"type":"pawn","color":"white"},
    "a1":{"type":"rook","color":"white"},  "b1":{"type":"knight","color":"white"},
    "c1":{"type":"bishop","color":"white"},"d1":{"type":"queen","color":"white"},
    "e1":{"type":"king","color":"white"},  "f1":{"type":"bishop","color":"white"},
    "g1":{"type":"knight","color":"white"},"h1":{"type":"rook","color":"white"}
  }';

  -- 5. Create the active game
  INSERT INTO public.games (
    white_player_id, white_player_username,
    black_player_id, black_player_username,
    time_format,     board_state,
    current_turn,    status
  ) VALUES (
    v_white_id,    v_white_uname,
    v_black_id,    v_black_uname,
    p_time_format, v_board,
    'white',       'active'
  )
  RETURNING id INTO v_game_id;

  -- 6. Stamp game_id onto the queue row — this UPDATE triggers the realtime
  --    listener on the waiting client so they can navigate to the game.
  UPDATE public.matchmaking_queue
  SET    game_id = v_game_id
  WHERE  id      = p_queue_row_id;

  RETURN v_game_id;
END;
$$;
