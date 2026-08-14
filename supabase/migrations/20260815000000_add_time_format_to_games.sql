-- 1. Ensure time_format column on games and challenges tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'time_format'
  ) THEN
    ALTER TABLE public.games ADD COLUMN time_format text DEFAULT '10+0';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'challenges' AND column_name = 'time_format'
  ) THEN
    ALTER TABLE public.challenges ADD COLUMN time_format text DEFAULT '10+0';
  END IF;
END $$;

-- 2. Update initialize_open_match RPC to set time_limit, white_time_remaining, black_time_remaining based on p_time_format
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
  v_queue           RECORD;
  v_game_id         uuid;
  v_white_id        uuid;
  v_black_id        uuid;
  v_white_uname     text;
  v_black_uname     text;
  v_board           jsonb;
  v_minutes         int;
  v_initial_seconds int;
BEGIN
  -- Parse initial time in minutes from time_format string like "1+0", "3+2", "5+0", "15+10"
  BEGIN
    v_minutes := SPLIT_PART(p_time_format, '+', 1)::integer;
  EXCEPTION WHEN OTHERS THEN
    v_minutes := 10;
  END;
  
  v_initial_seconds := COALESCE(v_minutes, 10) * 60;
  IF v_initial_seconds <= 0 THEN
    v_initial_seconds := 600;
  END IF;

  -- 1. Lock the queue row atomically
  SELECT *
  INTO   v_queue
  FROM   public.matchmaking_queue
  WHERE  id      = p_queue_row_id
    AND  game_id IS NULL
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

  -- 5. Create the active game with selected time control
  INSERT INTO public.games (
    white_player_id, white_player_username,
    black_player_id, black_player_username,
    time_format,     time_limit,
    white_time_remaining, black_time_remaining,
    board_state,     current_turn, status
  ) VALUES (
    v_white_id,        v_white_uname,
    v_black_id,        v_black_uname,
    p_time_format,     v_initial_seconds,
    v_initial_seconds, v_initial_seconds,
    v_board,           'white', 'active'
  )
  RETURNING id INTO v_game_id;

  -- 6. Stamp game_id onto the queue row
  UPDATE public.matchmaking_queue
  SET    game_id = v_game_id
  WHERE  id      = p_queue_row_id;

  RETURN v_game_id;
END;
$$;
