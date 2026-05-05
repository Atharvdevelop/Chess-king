-- Run this in your Supabase SQL editor (or as a migration).
-- It wraps the game-state update + move insert in a single PL/pgSQL transaction,
-- eliminating the two-round-trip race condition that existed in the client.

CREATE OR REPLACE FUNCTION make_game_move(
  p_game_id             UUID,
  p_expected_turn       TEXT,   -- atomic lock: only proceeds if DB agrees it's this color's turn
  p_next_turn           TEXT,
  p_board_state         JSONB,
  p_white_time_remaining FLOAT,
  p_black_time_remaining FLOAT,
  p_from_position       TEXT,
  p_to_position         TEXT,
  p_piece               TEXT,
  p_captured_piece      TEXT,   -- nullable
  p_is_check            BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_game JSONB;
  v_move_number  INT;
BEGIN
  -- 1. Atomically update the game row.
  --    The WHERE clause on current_turn acts as the optimistic-concurrency lock:
  --    if another client already flipped the turn, this UPDATE matches 0 rows.
  UPDATE games
  SET
    board_state           = p_board_state,
    current_turn          = p_next_turn,
    last_move_at          = NOW(),
    updated_at            = NOW(),
    white_time_remaining  = p_white_time_remaining,
    black_time_remaining  = p_black_time_remaining
  WHERE id           = p_game_id
    AND current_turn = p_expected_turn
    AND status       = 'active'
  RETURNING to_jsonb(games.*) INTO v_updated_game;

  -- 2. If the update matched nothing, reject the move.
  IF v_updated_game IS NULL THEN
    RAISE EXCEPTION 'move_rejected: wrong turn or game not active';
  END IF;

  -- 3. Derive the next sequential move number inside the same transaction.
  SELECT COALESCE(MAX(move_number), 0) + 1
  INTO   v_move_number
  FROM   moves
  WHERE  game_id = p_game_id;

  -- 4. Insert the move record (same transaction → both commit or both roll back).
  INSERT INTO moves (
    game_id, move_number, player_color,
    from_position, to_position,
    piece, captured_piece, is_check
  ) VALUES (
    p_game_id, v_move_number, p_expected_turn,
    p_from_position, p_to_position,
    p_piece, p_captured_piece, p_is_check
  );

  -- 5. Return the updated game row so the caller can inspect it if needed.
  RETURN v_updated_game;
END;
$$;
