import { supabase } from './supabase';
import { Game, Player, Move, PieceColor, Position, Challenge, BoardState } from '../types/chess';
import { createInitialBoard, makeMove, positionToAlgebraic, positionToKey, isCheckmate, isStalemate, isKingInCheck } from './chessLogic';

// --- 1. PRESENCE & STATE MANAGEMENT ---

export async function updatePlayerStatus(playerId: string, status: 'online' | 'busy') {
  await supabase
    .from('players')
    .update({ 
      status, 
      last_seen: new Date().toISOString() 
    })
    .eq('id', playerId);
}

export async function updateHeartbeat(playerId: string) {
  await supabase
    .from('players')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', playerId);
}

export async function createOrGetPlayer(username: string): Promise<Player> {
  // Upsert on the unique `username` column so two simultaneous logins with the
  // same name cannot both see "player not found" and race to insert.
  // Existing rows get their status and last_seen refreshed; new rows are created.
  const { data, error } = await supabase
    .from('players')
    .upsert(
      { username, status: 'online', last_seen: new Date().toISOString() },
      { onConflict: 'username' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

// --- 2. PAGE DATA FETCHING (Lobby, Members, Playing) ---

export async function getLobbyPlayers(currentPlayerId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from('lobby_players')
    .select('*')
    .neq('id', currentPlayerId);

  if (error) throw error;
  return data || [];
}

export async function getAllMembers(): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getActiveMatches() {
  const { data, error } = await supabase
    .from('currently_playing')
    .select('*');

  if (error) throw error;
  return data || [];
}

// --- 3. CHALLENGE SYSTEM ---

export async function createChallenge(challengerId: string, challengedId: string): Promise<Challenge> {
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      challenger_id: challengerId,
      challenged_id: challengedId,
      status: 'pending'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPendingChallenges(playerId: string): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select('*, challenger:players!challenger_id(username)')
    .eq('challenged_id', playerId)
    .eq('status', 'pending');

  if (error) throw error;
  return data.map(c => ({
    ...c,
    challenger_username: (c.challenger as Record<string, unknown>)?.username || 'Unknown'
  })) || [];
}

export async function acceptChallenge(
  challengeId: string, 
  playerId: string, 
  challengerUsername: string, 
  playerUsername: string
): Promise<Challenge> {
  const initialBoard = createInitialBoard();

  const { data: challengeData } = await supabase
    .from('challenges')
    .select('challenger_id')
    .eq('id', challengeId)
    .single();

  if (!challengeData) throw new Error("Challenge not found");

  const { data: gameData, error: gameError } = await supabase
    .from('games')
    .insert({
      white_player_id: challengeData.challenger_id,
      black_player_id: playerId,
      board_state: initialBoard,
      current_turn: 'white',
      status: 'active',
      white_player_username: challengerUsername,
      black_player_username: playerUsername
    })
    .select()
    .single();

  if (gameError) throw gameError;

  await supabase
    .from('players')
    .update({ status: 'busy' })
    .in('id', [playerId, challengeData.challenger_id]);

  const { data, error } = await supabase
    .from('challenges')
    .update({ status: 'accepted', game_id: gameData.id })
    .eq('id', challengeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function rejectChallenge(challengeId: string): Promise<void> {
  await supabase.from('challenges').update({ status: 'rejected' }).eq('id', challengeId);
}

// --- 4. REALTIME SUBSCRIPTIONS ---

export function subscribeToChallenges(playerId: string, callback: (payload: { new?: { challenger_id?: string, challenged_id?: string, status?: string, game_id?: string } }) => void) {
  return supabase
    .channel(`lobby-${playerId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, (payload) => {
        const newData = payload.new as Record<string, unknown>;
        // Safety check with optional chaining ?.
        if (newData?.challenger_id === playerId || newData?.challenged_id === playerId) {
            callback(payload as { new?: { challenger_id?: string, challenged_id?: string, status?: string, game_id?: string } });
        }
    })
    .subscribe();
}

export function subscribeToChallengeAccepted(
  playerId: string, 
  onAccepted: (gameId: string, name: string) => void
) {
  return supabase
    .channel(`auto-redirect-${playerId}`)
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'challenges' 
    }, (payload) => {
      const newData = payload.new as Record<string, unknown>;
      if (newData?.status === 'accepted' && newData?.game_id && newData?.challenger_id === playerId) {
        onAccepted(newData.game_id as string, 'Opponent');
      }
    })
    .subscribe();
}

// CRITICAL: The move listener so you see pieces move on your screen!
export function subscribeToGame(gameId: string, callback: (game: Game) => void) {
  return supabase
    .channel(`game:${gameId}`)
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'games', 
      filter: `id=eq.${gameId}` 
    }, (payload) => {
      callback(payload.new as Game);
    })
    .subscribe();
}

// --- 5. GAME LOGIC & MOVES ---

export async function getGame(gameId: string): Promise<Game | null> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function makeGameMove(
  gameId: string,
  playerId: string,
  from: Position,
  to: Position,
  currentGame: Game
): Promise<BoardState> {
  const piece = currentGame.board_state[positionToKey(from)];
  if (!piece) throw new Error('No piece at source position');

  // Guard: playerId must be a non-empty string — a missing or null player ID
  // would cause the Postgres function to reject the move with a cryptic error.
  if (!playerId) throw new Error('Player ID is required to make a move');

  // Compute the new board client-side (needed for optimistic UI rendering and
  // post-move game-end detection before the DB subscription fires).
  const { newBoard, capturedPiece } = makeMove(currentGame.board_state, from, to);
  const nextTurn: PieceColor = currentGame.current_turn === 'white' ? 'black' : 'white';

  // Build 'e2-e4' style notation from the two positions.
  const moveNotation = `${positionToAlgebraic(from)}-${positionToAlgebraic(to)}`;
  
  const isCheck = isCheckmate(newBoard, nextTurn) || isKingInCheck(newBoard, nextTurn);
  const isCheckmateVal = isCheckmate(newBoard, nextTurn);

  // Single RPC call → UPDATE games + INSERT INTO moves in one transaction.
  const { error } = await supabase.rpc('make_game_move', {
    p_game_id:       gameId,
    p_player_id:     playerId,
    p_new_board:     newBoard,
    p_move_notation: moveNotation,
    p_piece:         piece.type,
    p_captured_piece: capturedPiece?.type || null,
    p_is_check:      isCheck,
    p_is_checkmate:  isCheckmateVal
  });

  if (error) {
    if (error.message?.includes('move_rejected')) {
      throw new Error('Move rejected: not your turn');
    }
    if (error.message?.includes('game_not_found')) {
      throw new Error('Game is no longer active');
    }
    throw error;
  }

  // --- Post-move game-end detection ---
  // Check the board that will be facing the next player.
  // isCheckmate / isStalemate use the full self-check-aware legal-move scan.
  if (isCheckmate(newBoard, nextTurn)) {
    // The player who just moved wins.
    await endGame(gameId, currentGame.current_turn);
  } else if (isStalemate(newBoard, nextTurn)) {
    // No legal moves but not in check → draw.
    await endGame(gameId, null);
  }

  // Return the computed board so the caller can apply an optimistic UI update
  // immediately, before the realtime subscription delivers the DB snapshot.
  return newBoard;
}

export async function getMoves(gameId: string): Promise<Move[]> {
  const { data, error } = await supabase
    .from('moves')
    .select('*')
    .eq('game_id', gameId)
    .order('move_number', { ascending: true });
  if (error) throw error;
  return data || [];
}

// endGame: called after checkmate, stalemate, or timeout.
// winner = null means draw (stalemate).
export async function endGame(
  gameId: string,
  winner: PieceColor | null
): Promise<void> {
  await supabase
    .from('games')
    .update({
      status: 'finished',
      winner: winner ?? 'draw',
    })
    .eq('id', gameId);
}

export async function endGameOnTimeout(gameId: string, lostColor: PieceColor): Promise<void> {
  const winner: PieceColor = lostColor === 'white' ? 'black' : 'white';
  await endGame(gameId, winner);
}