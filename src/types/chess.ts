export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type PieceColor = 'white' | 'black';
export type GameStatus = 'waiting' | 'active' | 'completed' | 'abandoned';

export interface ChessPiece {
  type: PieceType;
  color: PieceColor;
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
