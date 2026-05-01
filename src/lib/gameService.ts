import { supabase } from './supabase';
import { Game, Player, Move, PieceColor, Position, Challenge } from '../types/chess';
import { createInitialBoard, makeMove, positionToAlgebraic, positionToKey, isKingInCheck } from './chessLogic';

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
  const { data: existingPlayer } = await supabase
    .from('players')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (existingPlayer) {
    await updatePlayerStatus(existingPlayer.id, 'online');
    return existingPlayer;
  }

  const { data: newPlayer, error } = await supabase
    .from('players')
    .insert({ username, status: 'online' })
    .select()
    .single();

  if (error) throw error;
  return newPlayer;
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
    challenger_username: (c.challenger as any)?.username || 'Unknown'
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

export function subscribeToChallenges(playerId: string, callback: (payload: any) => void) {
  return supabase
    .channel(`lobby-${playerId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, (payload) => {
        // Safety check with optional chaining ?.
        if (payload.new?.challenger_id === playerId || payload.new?.challenged_id === playerId) {
            callback(payload);
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
      if (payload.new?.status === 'accepted' && payload.new?.game_id && payload.new?.challenger_id === playerId) {
        onAccepted(payload.new.game_id, 'Opponent');
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
  from: Position,
  to: Position,
  currentGame: Game
): Promise<void> {
  const piece = currentGame.board_state[positionToKey(from)];
  if (!piece) throw new Error('No piece at source position');

  const { newBoard, capturedPiece } = makeMove(currentGame.board_state, from, to);
  const nextTurn: PieceColor = currentGame.current_turn === 'white' ? 'black' : 'white';
  const isCheck = isKingInCheck(newBoard, nextTurn);

  await supabase.from('moves').insert({
    game_id: gameId,
    move_number: await getNextMoveNumber(gameId),
    player_color: currentGame.current_turn,
    from_position: positionToAlgebraic(from),
    to_position: positionToAlgebraic(to),
    piece: piece.type,
    captured_piece: capturedPiece?.type || null,
    is_check: isCheck
  });

  await supabase
    .from('games')
    .update({
      board_state: newBoard,
      current_turn: nextTurn,
      last_move_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', gameId);
}

async function getNextMoveNumber(gameId: string): Promise<number> {
  const { data } = await supabase
    .from('moves')
    .select('move_number')
    .eq('game_id', gameId)
    .order('move_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? data.move_number + 1 : 1;
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