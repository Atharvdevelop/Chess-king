-- Run this in your Supabase SQL editor (or as a migration).
-- Drops and recreates the function with the simplified 4-parameter interface.
-- The function performs the game UPDATE + move INSERT in a single transaction,
-- computing elapsed time, player color, and move number entirely server-side.

CREATE OR REPLACE FUNCTION make_game_move(
  p_game_id       UUID,
  p_player_id     UUID,   -- used to verify it is this player's turn
  p_new_board     JSONB,  -- board state after the move (computed client-side)
  p_move_notation TEXT    -- 'e2-e4' style; split into from/to inside the function
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
  v_updated_game JSONB;
BEGIN
  -- 1. Lock the game row for the duration of this transaction so no concurrent
  --    call can flip current_turn between our read and our write.
  SELECT * INTO v_game
  FROM   games
  WHERE  id = p_game_id
    AND  status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game_not_found: game % is not active', p_game_id;
  END IF;

  -- 2. Verify it is this player's turn by matching player_id to the side whose
  --    turn current_turn indicates.  Rejects spectators and out-of-turn calls.
  IF    v_game.white_player_id = p_player_id AND v_game.current_turn = 'white' THEN
    v_player_color := 'white';
    v_next_turn    := 'black';
  ELSIF v_game.black_player_id = p_player_id AND v_game.current_turn = 'black' THEN
    v_player_color := 'black';
    v_next_turn    := 'white';
  ELSE
    RAISE EXCEPTION 'move_rejected: not your turn';
  END IF;

  -- 3. Compute elapsed seconds server-side — no client clock skew.
  v_elapsed_sec := EXTRACT(EPOCH FROM (NOW() - v_game.last_move_at));

  -- 4. Deduct elapsed time from the moving player's clock only.
  IF v_player_color = 'white' THEN
    v_new_white := GREATEST(0, v_game.white_time_remaining - v_elapsed_sec);
    v_new_black := v_game.black_time_remaining;
  ELSE
    v_new_white := v_game.white_time_remaining;
    v_new_black := GREATEST(0, v_game.black_time_remaining - v_elapsed_sec);
  END IF;

  -- 5. Parse 'e2-e4' notation into separate from/to position columns.
  v_from_pos := SPLIT_PART(p_move_notation, '-', 1);
  v_to_pos   := SPLIT_PART(p_move_notation, '-', 2);

  -- 6. Update the game row (the row lock from step 1 guarantees atomicity).
  UPDATE games
  SET
    board_state          = p_new_board,
    current_turn         = v_next_turn,
    last_move_at         = NOW(),
    updated_at           = NOW(),
    white_time_remaining = v_new_white,
    black_time_remaining = v_new_black
  WHERE id = p_game_id
  RETURNING to_jsonb(games.*) INTO v_updated_game;

  -- 7. Derive next sequential move number inside the same transaction.
  SELECT COALESCE(MAX(move_number), 0) + 1
  INTO   v_move_number
  FROM   moves
  WHERE  game_id = p_game_id;

  -- 8. Insert the move record (same transaction → both commit or both roll back).
  INSERT INTO moves (
    game_id, move_number, player_color,
    from_position, to_position,
    notation
  ) VALUES (
    p_game_id, v_move_number, v_player_color,
    v_from_pos, v_to_pos,
    p_move_notation
  );

  -- 9. Return the updated game row so callers can inspect the new state.
  RETURN v_updated_game;
END;
$$;
