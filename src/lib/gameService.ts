import { supabase } from './supabase';
import { Game, Player, Move, PieceColor, Position, Challenge } from '../types/chess';
import { createInitialBoard, makeMove, positionToAlgebraic, positionToKey, isKingInCheck } from './chessLogic';

// Update player timestamp so they don't become a 'ghost'
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
    await updateHeartbeat(existingPlayer.id);
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

export async function getAvailablePlayers(currentPlayerId: string): Promise<Player[]> {
  // We fetch from our new 'active_players' view to avoid ghosts
  const { data, error } = await supabase
    .from('active_players')
    .select('*')
    .neq('id', currentPlayerId);

  if (error) throw error;
  return data || [];
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

export async function acceptChallenge(challengeId: string, playerId: string, challengerUsername: string, playerUsername: string): Promise<Challenge> {
  const timeLimit = 600;
  const initialBoard = createInitialBoard();

  const { data: challengeData } = await supabase
    .from('challenges')
    .select('challenger_id')
    .eq('id', challengeId)
    .single();

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

  const { data, error } = await supabase
    .from('challenges')
    .update({ status: 'accepted', game_id: gameData.id })
    .eq('id', challengeId)
    .select()
    .single();

  return data;
}

export async function rejectChallenge(challengeId: string): Promise<void> {
  await supabase.from('challenges').update({ status: 'rejected' }).eq('id', challengeId);
}

export function subscribeToChallenges(playerId: string, callback: (payload: any) => void) {
  return supabase
    .channel(`lobby-${playerId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, (payload) => {
        // Trigger if I am the challenger OR challenged
        if (payload.new.challenger_id === playerId || payload.new.challenged_id === playerId) {
            callback(payload);
        }
    })
    .subscribe();
}