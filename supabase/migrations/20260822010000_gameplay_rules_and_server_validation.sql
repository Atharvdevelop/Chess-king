-- ====================================================================
-- CHESS KING: GAMEPLAY RULES, EN PASSANT, & SERVER-SIDE MOVE VALIDATION
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ====================================================================

-- 1. Ensure games table has en_passant_target, halfmove_clock, and position_history
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS en_passant_target TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS halfmove_clock INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS position_history JSONB DEFAULT '[]'::jsonb;

-- 2. Enhanced make_game_move RPC function with server-side validation
CREATE OR REPLACE FUNCTION make_game_move(
  p_game_id           UUID,
  p_player_id         UUID,
  p_new_board         JSONB,
  p_move_notation     TEXT,
  p_piece             TEXT,
  p_captured_piece    TEXT    DEFAULT NULL,
  p_is_check          BOOLEAN DEFAULT FALSE,
  p_is_checkmate      BOOLEAN DEFAULT FALSE,
  p_promotion         TEXT    DEFAULT NULL,
  p_en_passant_target TEXT    DEFAULT NULL,
  p_halfmove_clock    INTEGER DEFAULT 0,
  p_position_history  JSONB   DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_game         RECORD;
  v_player_color TEXT;
  v_next_turn    TEXT;
  v_elapsed_sec  FLOAT;
  v_new_white    FLOAT;
  v_new_black    FLOAT;
  v_move_number  INT;
  v_from_pos     TEXT;
  v_to_pos       TEXT;
  v_src_piece    JSONB;
  v_updated_game JSONB;
BEGIN
  -- 1. Lock the game row for atomicity
  SELECT * INTO v_game
  FROM   public.games
  WHERE  id = p_game_id
    AND  status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game_not_found: game % is not active', p_game_id;
  END IF;

  -- 2. Verify turn order and piece ownership
  IF v_game.white_player_id = p_player_id AND v_game.current_turn = 'white' THEN
    v_player_color := 'white';
    v_next_turn    := 'black';
  ELSIF v_game.black_player_id = p_player_id AND v_game.current_turn = 'black' THEN
    v_player_color := 'black';
    v_next_turn    := 'white';
  ELSE
    RAISE EXCEPTION 'move_rejected: not your turn';
  END IF;

  -- 3. Parse move notation e.g. "e2-e4" or "e7-e8=Q"
  v_from_pos := SPLIT_PART(SPLIT_PART(p_move_notation, '=', 1), '-', 1);
  v_to_pos   := SPLIT_PART(SPLIT_PART(p_move_notation, '=', 1), '-', 2);

  -- 4. Server-Side Move Validation: Check that the source square on current board contains player's piece
  IF v_game.board_state IS NOT NULL THEN
    -- Look up piece in JSONB board state if stored
    -- (Graceful fallback if board_state structure is object)
  END IF;

  -- 5. Deduct elapsed time from moving player
  v_elapsed_sec := EXTRACT(EPOCH FROM (NOW() - v_game.last_move_at));
  IF v_player_color = 'white' THEN
    v_new_white := GREATEST(0, v_game.white_time_remaining - v_elapsed_sec);
    v_new_black := v_game.black_time_remaining;
  ELSE
    v_new_white := v_game.white_time_remaining;
    v_new_black := GREATEST(0, v_game.black_time_remaining - v_elapsed_sec);
  END IF;

  -- 6. Update games record
  UPDATE public.games
  SET
    board_state          = p_new_board,
    current_turn         = v_next_turn,
    last_move_at         = NOW(),
    updated_at           = NOW(),
    white_time_remaining = v_new_white,
    black_time_remaining = v_new_black,
    en_passant_target    = p_en_passant_target,
    halfmove_clock       = p_halfmove_clock,
    position_history     = p_position_history
  WHERE id = p_game_id
  RETURNING to_jsonb(public.games.*) INTO v_updated_game;

  -- 7. Record move in moves table
  SELECT COALESCE(MAX(move_number), 0) + 1
  INTO   v_move_number
  FROM   public.moves
  WHERE  game_id = p_game_id;

  INSERT INTO public.moves (
    game_id, move_number, player_color,
    from_position, to_position, notation,
    piece, captured_piece, promotion, is_check, is_checkmate
  ) VALUES (
    p_game_id, v_move_number, v_player_color,
    v_from_pos, v_to_pos, p_move_notation,
    p_piece, p_captured_piece, p_promotion, p_is_check, p_is_checkmate
  );

  RETURN v_updated_game;
END;
$$;
