import { BoardState, ChessPiece, PieceColor, Position } from '../types/chess';

export function positionToKey(pos: Position): string {
  return `${pos.row},${pos.col}`;
}

export function keyToPosition(key: string): Position {
  const [row, col] = key.split(',').map(Number);
  return { row, col };
}

export function createInitialBoard(): BoardState {
  const board: BoardState = {};

  const backRow: Array<'rook' | 'knight' | 'bishop' | 'queen' | 'king'> =
    ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

  for (let col = 0; col < 8; col++) {
    board[positionToKey({ row: 0, col })] = { type: backRow[col], color: 'black' };
    board[positionToKey({ row: 1, col })] = { type: 'pawn', color: 'black' };
    board[positionToKey({ row: 6, col })] = { type: 'pawn', color: 'white' };
    board[positionToKey({ row: 7, col })] = { type: backRow[col], color: 'white' };
  }

  for (let row = 2; row < 6; row++) {
    for (let col = 0; col < 8; col++) {
      board[positionToKey({ row, col })] = null;
    }
  }

  return board;
}

export function isValidPosition(pos: Position): boolean {
  return pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;
}

export function getPieceAt(board: BoardState, pos: Position): ChessPiece | null {
  if (!isValidPosition(pos)) return null;
  return board[positionToKey(pos)] || null;
}

export function isValidMove(
  board: BoardState,
  from: Position,
  to: Position,
  currentTurn: PieceColor
): boolean {
  const piece = getPieceAt(board, from);
  if (!piece || piece.color !== currentTurn) return false;

  const targetPiece = getPieceAt(board, to);
  if (targetPiece && targetPiece.color === piece.color) return false;

  const dx = to.col - from.col;
  const dy = to.row - from.row;

  switch (piece.type) {
    case 'pawn':
      return isValidPawnMove(board, from, to, piece.color);
    case 'rook':
      return isValidRookMove(board, from, to);
    case 'knight':
      return isValidKnightMove(dx, dy);
    case 'bishop':
      return isValidBishopMove(board, from, to);
    case 'queen':
      return isValidQueenMove(board, from, to);
    case 'king':
      return isValidKingMove(board, from, to, piece.color);
    default:
      return false;
  }
}

function isValidPawnMove(
  board: BoardState,
  from: Position,
  to: Position,
  color: PieceColor
): boolean {
  const direction = color === 'white' ? -1 : 1;
  const startRow = color === 'white' ? 6 : 1;
  const dx = to.col - from.col;
  const dy = to.row - from.row;

  if (dy === direction && dx === 0) {
    return !getPieceAt(board, to);
  }

  if (dy === 2 * direction && dx === 0 && from.row === startRow) {
    const middlePos = { row: from.row + direction, col: from.col };
    return !getPieceAt(board, middlePos) && !getPieceAt(board, to);
  }

  if (dy === direction && Math.abs(dx) === 1) {
    const targetPiece = getPieceAt(board, to);
    return targetPiece !== null && targetPiece.color !== color;
  }

  return false;
}

function isValidRookMove(board: BoardState, from: Position, to: Position): boolean {
  if (from.row !== to.row && from.col !== to.col) return false;
  return isPathClear(board, from, to);
}

function isValidKnightMove(dx: number, dy: number): boolean {
  return (Math.abs(dx) === 2 && Math.abs(dy) === 1) ||
         (Math.abs(dx) === 1 && Math.abs(dy) === 2);
}

function isValidBishopMove(board: BoardState, from: Position, to: Position): boolean {
  if (Math.abs(to.row - from.row) !== Math.abs(to.col - from.col)) return false;
  return isPathClear(board, from, to);
}

function isValidQueenMove(board: BoardState, from: Position, to: Position): boolean {
  return isValidRookMove(board, from, to) || isValidBishopMove(board, from, to);
}

function isValidKingMove(board: BoardState, from: Position, to: Position, color: PieceColor): boolean {
  const dx = to.col - from.col;
  const dy = to.row - from.row;

  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return true;

  // Castling
  if (Math.abs(dx) === 2 && dy === 0) {
    const piece = getPieceAt(board, from);
    if (piece && !piece.hasMoved) {
      const isKingside = dx > 0;
      const rookCol = isKingside ? 7 : 0;
      const rookPos = { row: from.row, col: rookCol };
      const rook = getPieceAt(board, rookPos);
      if (rook && rook.type === 'rook' && rook.color === color && !rook.hasMoved) {
        // Check path is clear
        const step = Math.sign(dx);
        for (let c = from.col + step; c !== rookCol; c += step) {
          if (getPieceAt(board, { row: from.row, col: c })) return false;
        }
        return true;
      }
    }
  }

  return false;
}

function isPathClear(board: BoardState, from: Position, to: Position): boolean {
  const dx = Math.sign(to.col - from.col);
  const dy = Math.sign(to.row - from.row);

  let currentPos = { row: from.row + dy, col: from.col + dx };

  while (currentPos.row !== to.row || currentPos.col !== to.col) {
    if (getPieceAt(board, currentPos)) return false;
    currentPos = { row: currentPos.row + dy, col: currentPos.col + dx };
  }

  return true;
}

export function makeMove(
  board: BoardState,
  from: Position,
  to: Position
): { newBoard: BoardState; capturedPiece: ChessPiece | null } {
  const newBoard = { ...board };
  const piece = getPieceAt(board, from);
  const capturedPiece = getPieceAt(board, to);

  if (piece) {
    const movedPiece = { ...piece, hasMoved: true };
    newBoard[positionToKey(to)] = movedPiece;
  }
  newBoard[positionToKey(from)] = null;

  // Castling logic: move the rook as well
  if (piece && piece.type === 'king' && Math.abs(to.col - from.col) === 2) {
    const isKingside = to.col > from.col;
    const rookFromCol = isKingside ? 7 : 0;
    const rookToCol = isKingside ? to.col - 1 : to.col + 1;
    const rookPos = { row: from.row, col: rookFromCol };
    const rook = getPieceAt(board, rookPos);
    if (rook) {
      const movedRook = { ...rook, hasMoved: true };
      newBoard[positionToKey({ row: from.row, col: rookToCol })] = movedRook;
      newBoard[positionToKey(rookPos)] = null;
    }
  }

  return { newBoard, capturedPiece };
}

export function isKingInCheck(board: BoardState, kingColor: PieceColor): boolean {
  let kingPos: Position | null = null;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const pos = { row, col };
      const piece = getPieceAt(board, pos);
      if (piece && piece.type === 'king' && piece.color === kingColor) {
        kingPos = pos;
        break;
      }
    }
    if (kingPos) break;
  }

  if (!kingPos) return false;

  const enemyColor: PieceColor = kingColor === 'white' ? 'black' : 'white';

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const pos = { row, col };
      const piece = getPieceAt(board, pos);
      if (piece && piece.color === enemyColor) {
        if (isValidMove(board, pos, kingPos, enemyColor)) {
          return true;
        }
      }
    }
  }

  return false;
}

export function positionToAlgebraic(pos: Position): string {
  const files = 'abcdefgh';
  return `${files[pos.col]}${8 - pos.row}`;
}

export function algebraicToPosition(algebraic: string): Position {
  const files = 'abcdefgh';
  const col = files.indexOf(algebraic[0]);
  const row = 8 - parseInt(algebraic[1]);
  return { row, col };
}
