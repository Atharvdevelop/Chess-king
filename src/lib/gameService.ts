import { supabase } from './supabase';
import { Game, Player, Move, PieceColor, Position, Challenge, ChallengeStatus } from '../types/chess';
import { createInitialBoard, makeMove, positionToAlgebraic, positionToKey, isKingInCheck } from './chessLogic';

export async function createOrGetPlayer(username: string): Promise<Player> {
  const { data: existingPlayer } = await supabase
    .from('players')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (existingPlayer) {
    await supabase
      .from('players')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', existingPlayer.id);
    return existingPlayer;
  }

  const { data: newPlayer, error } = await supabase
    .from('players')
    .insert({ username })
    .select()
    .single();

  if (error) throw error;
  return newPlayer;
}

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

export async function getAvailablePlayers(currentPlayerId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .neq('id', currentPlayerId)
    .order('last_seen', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getPendingChallenges(playerId: string): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('challenged_id', playerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const challenges = data || [];

  for (const challenge of challenges) {
    const { data: player } = await supabase
      .from('players')
      .select('username')
      .eq('id', challenge.challenger_id)
      .maybeSingle();
    if (player) {
      challenge.challenger_username = player.username;
    }
  }

  return challenges;
}

export async function acceptChallenge(challengeId: string, playerId: string, challengerUsername: string, playerUsername: string): Promise<Challenge> {
  const timeLimit = 600;
  const initialBoard = createInitialBoard();

  const { data: gameData, error: gameError } = await supabase
    .from('games')
    .insert({
      white_player_id: (await supabase
        .from('challenges')
        .select('challenger_id')
        .eq('id', challengeId)
        .single()).data.challenger_id,
      black_player_id: playerId,
      board_state: initialBoard,
      current_turn: 'white',
      status: 'active',
      time_limit: timeLimit,
      white_time_remaining: timeLimit,
      black_time_remaining: timeLimit,
      last_move_at: new Date().toISOString(),
      white_player_username: challengerUsername,
      black_player_username: playerUsername
    })
    .select()
    .single();

  if (gameError) throw gameError;

  const { data, error } = await supabase
    .from('challenges')
    .update({
      status: 'accepted',
      game_id: gameData.id
    })
    .eq('id', challengeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function rejectChallenge(challengeId: string): Promise<void> {
  await supabase
    .from('challenges')
    .update({ status: 'rejected' })
    .eq('id', challengeId);
}

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

  const moveNumber = await getNextMoveNumber(gameId);

  await supabase.from('moves').insert({
    game_id: gameId,
    move_number: moveNumber,
    player_color: currentGame.current_turn,
    from_position: positionToAlgebraic(from),
    to_position: positionToAlgebraic(to),
    piece: piece.type,
    captured_piece: capturedPiece?.type || null,
    promotion: null,
    is_check: isCheck,
    is_checkmate: false
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

export function subscribeToGame(
  gameId: string,
  callback: (game: Game) => void
) {
  const channel = supabase
    .channel(`game:${gameId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`
      },
      (payload) => {
        callback(payload.new as Game);
      }
    )
    .subscribe();

  return channel;
}

export function subscribeToChallenges(
  playerId: string,
  callback: () => void
) {
  const channel = supabase
    .channel(`challenges:${playerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'challenges',
        filter: `challenged_id=eq.${playerId}`
      },
      () => {
        callback();
      }
    )
    .subscribe();

  return channel;
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
