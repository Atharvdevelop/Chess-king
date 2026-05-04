export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type PieceColor = 'white' | 'black';
export type GameStatus = 'waiting' | 'active' | 'completed' | 'abandoned';
export type ChallengeStatus = 'pending' | 'accepted' | 'rejected';

export interface ChessPiece {
  type: PieceType;
  color: PieceColor;
  hasMoved?: boolean;
}

export interface Position {
  row: number;
  col: number;
}

export interface BoardState {
  [key: string]: ChessPiece | null;
}

export interface Player {
  id: string;
  username: string;
  created_at: string;
  last_seen: string;
  status?: string;
}

export interface Game {
  id: string;
  white_player_id: string;
  black_player_id: string | null;
  board_state: BoardState;
  current_turn: PieceColor;
  status: GameStatus;
  winner: PieceColor | 'draw' | null;
  created_at: string;
  updated_at: string;
  time_limit: number;
  white_time_remaining: number;
  black_time_remaining: number;
  last_move_at: string;
  white_player_username?: string;
  black_player_username?: string;
}

export interface Move {
  id: string;
  game_id: string;
  move_number: number;
  player_color: PieceColor;
  from_position: string;
  to_position: string;
  piece: string;
  captured_piece: string | null;
  promotion: string | null;
  is_check: boolean;
  is_checkmate: boolean;
  created_at: string;
}

export interface Challenge {
  id: string;
  challenger_id: string;
  challenged_id: string;
  status: ChallengeStatus;
  game_id: string | null;
  created_at: string;
  updated_at: string;
  challenger_username?: string;
}
