import { BoardState, ChessPiece, PieceColor, Position, PieceType } from '../types/chess';

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

// ---------------------------------------------------------------------------
// simulateMove
// ---------------------------------------------------------------------------
export function simulateMove(
  board: BoardState,
  from: Position,
  to: Position,
  color: PieceColor,
  enPassantTarget?: Position | null
): boolean {
  const scratch: BoardState = { ...board };
  const piece = scratch[positionToKey(from)];
  scratch[positionToKey(to)] = piece;
  scratch[positionToKey(from)] = null;

  // Handle en-passant simulated removal
  if (
    piece &&
    piece.type === 'pawn' &&
    enPassantTarget &&
    to.row === enPassantTarget.row &&
    to.col === enPassantTarget.col &&
    Math.abs(to.col - from.col) === 1
  ) {
    scratch[positionToKey({ row: from.row, col: to.col })] = null;
  }

  return !isKingInCheck(scratch, color);
}

// ---------------------------------------------------------------------------
// isSquareAttackedBy
// ---------------------------------------------------------------------------
function isSquareAttackedBy(
  board: BoardState,
  target: Position,
  attackerColor: PieceColor
): boolean {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const pos = { row, col };
      const piece = getPieceAt(board, pos);
      if (!piece || piece.color !== attackerColor) continue;
      if (canAttackSquare(board, pos, target, piece)) return true;
    }
  }
  return false;
}

function canAttackSquare(
  board: BoardState,
  from: Position,
  to: Position,
  piece: ChessPiece
): boolean {
  const targetPiece = getPieceAt(board, to);
  if (targetPiece && targetPiece.color === piece.color) return false;

  const dx = to.col - from.col;
  const dy = to.row - from.row;

  switch (piece.type) {
    case 'pawn': {
      const direction = piece.color === 'white' ? -1 : 1;
      return dy === direction && Math.abs(dx) === 1;
    }
    case 'rook':
      return isValidRookMove(board, from, to);
    case 'knight':
      return isValidKnightMove(dx, dy);
    case 'bishop':
      return isValidBishopMove(board, from, to);
    case 'queen':
      return isValidQueenMove(board, from, to);
    case 'king':
      return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// isValidMove
// ---------------------------------------------------------------------------
export function isValidMove(
  board: BoardState,
  from: Position,
  to: Position,
  currentTurn: PieceColor,
  enPassantTarget?: Position | null
): boolean {
  const piece = getPieceAt(board, from);
  if (!piece || piece.color !== currentTurn) return false;

  const targetPiece = getPieceAt(board, to);
  if (targetPiece && targetPiece.color === piece.color) return false;

  const dx = to.col - from.col;
  const dy = to.row - from.row;

  let rawOk = false;
  switch (piece.type) {
    case 'pawn':
      rawOk = isValidPawnMove(board, from, to, piece.color, enPassantTarget);
      break;
    case 'rook':
      rawOk = isValidRookMove(board, from, to);
      break;
    case 'knight':
      rawOk = isValidKnightMove(dx, dy);
      break;
    case 'bishop':
      rawOk = isValidBishopMove(board, from, to);
      break;
    case 'queen':
      rawOk = isValidQueenMove(board, from, to);
      break;
    case 'king':
      rawOk = isValidKingMove(board, from, to, piece.color);
      break;
    default:
      return false;
  }

  if (!rawOk) return false;

  return simulateMove(board, from, to, piece.color, enPassantTarget);
}

function isValidPawnMove(
  board: BoardState,
  from: Position,
  to: Position,
  color: PieceColor,
  enPassantTarget?: Position | null
): boolean {
  const direction = color === 'white' ? -1 : 1;
  const startRow = color === 'white' ? 6 : 1;
  const dx = to.col - from.col;
  const dy = to.row - from.row;

  // Single step forward
  if (dy === direction && dx === 0) {
    return !getPieceAt(board, to);
  }

  // Double step forward from starting rank
  if (dy === 2 * direction && dx === 0 && from.row === startRow) {
    const middlePos = { row: from.row + direction, col: from.col };
    return !getPieceAt(board, middlePos) && !getPieceAt(board, to);
  }

  // Diagonal capture
  if (dy === direction && Math.abs(dx) === 1) {
    const targetPiece = getPieceAt(board, to);
    if (targetPiece !== null && targetPiece.color !== color) return true;

    // En Passant capture
    if (enPassantTarget && to.row === enPassantTarget.row && to.col === enPassantTarget.col) {
      const adjacentPawn = getPieceAt(board, { row: from.row, col: to.col });
      if (adjacentPawn && adjacentPawn.type === 'pawn' && adjacentPawn.color !== color) {
        return true;
      }
    }
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

function isValidKingMove(
  board: BoardState,
  from: Position,
  to: Position,
  color: PieceColor
): boolean {
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  const enemyColor: PieceColor = color === 'white' ? 'black' : 'white';

  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
    return !isSquareAttackedBy(board, to, enemyColor);
  }

  // Castling
  if (Math.abs(dx) === 2 && dy === 0) {
    const piece = getPieceAt(board, from);
    if (piece && !piece.hasMoved) {
      if (isKingInCheck(board, color)) return false;

      const isKingside = dx > 0;
      const rookCol = isKingside ? 7 : 0;
      const rookPos = { row: from.row, col: rookCol };
      const rook = getPieceAt(board, rookPos);
      if (rook && rook.type === 'rook' && rook.color === color && !rook.hasMoved) {
        const step = Math.sign(dx);
        for (let c = from.col + step; c !== rookCol; c += step) {
          if (getPieceAt(board, { row: from.row, col: c })) return false;
        }
        for (let c = from.col; c !== to.col + step; c += step) {
          if (isSquareAttackedBy(board, { row: from.row, col: c }, enemyColor)) {
            return false;
          }
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

// ---------------------------------------------------------------------------
// isPromotionMove
// ---------------------------------------------------------------------------
export function isPromotionMove(board: BoardState, from: Position, to: Position): boolean {
  const piece = getPieceAt(board, from);
  if (!piece || piece.type !== 'pawn') return false;
  return (piece.color === 'white' && to.row === 0) || (piece.color === 'black' && to.row === 7);
}

// ---------------------------------------------------------------------------
// makeMove
// ---------------------------------------------------------------------------
export function makeMove(
  board: BoardState,
  from: Position,
  to: Position,
  promotionType: PieceType = 'queen',
  enPassantTarget?: Position | null
): { 
  newBoard: BoardState; 
  capturedPiece: ChessPiece | null;
  newEnPassantTarget: Position | null;
  isEnPassant: boolean;
  isPromotion: boolean;
} {
  const newBoard = { ...board };
  const piece = getPieceAt(board, from);
  let capturedPiece = getPieceAt(board, to);
  let newEnPassantTarget: Position | null = null;
  let isEnPassant = false;
  let isPromotion = false;

  if (piece) {
    let movedPiece: ChessPiece = { ...piece, hasMoved: true };

    // 1. Pawn double-step -> sets en passant target
    if (movedPiece.type === 'pawn' && Math.abs(to.row - from.row) === 2) {
      const step = (to.row - from.row) / 2;
      newEnPassantTarget = { row: from.row + step, col: from.col };
    }

    // 2. En Passant capture execution
    if (
      movedPiece.type === 'pawn' &&
      enPassantTarget &&
      to.row === enPassantTarget.row &&
      to.col === enPassantTarget.col &&
      Math.abs(to.col - from.col) === 1 &&
      !capturedPiece
    ) {
      const capturedPawnPos = { row: from.row, col: to.col };
      capturedPiece = getPieceAt(board, capturedPawnPos);
      newBoard[positionToKey(capturedPawnPos)] = null;
      isEnPassant = true;
    }

    // 3. Pawn Promotion (Queen, Knight, Rook, Bishop)
    if (movedPiece.type === 'pawn' && (to.row === 0 || to.row === 7)) {
      const validPromo = ['queen', 'knight', 'rook', 'bishop'].includes(promotionType) ? promotionType : 'queen';
      movedPiece = { ...movedPiece, type: validPromo };
      isPromotion = true;
    }

    newBoard[positionToKey(to)] = movedPiece;
  }
  newBoard[positionToKey(from)] = null;

  // 4. Castling: move the rook
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

  return { newBoard, capturedPiece, newEnPassantTarget, isEnPassant, isPromotion };
}

// ---------------------------------------------------------------------------
// isKingInCheck
// ---------------------------------------------------------------------------
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
  return isSquareAttackedBy(board, kingPos, enemyColor);
}

// ---------------------------------------------------------------------------
// hasLegalMoves
// ---------------------------------------------------------------------------
export function hasLegalMoves(
  board: BoardState, 
  color: PieceColor,
  enPassantTarget?: Position | null
): boolean {
  for (let fromRow = 0; fromRow < 8; fromRow++) {
    for (let fromCol = 0; fromCol < 8; fromCol++) {
      const from = { row: fromRow, col: fromCol };
      const piece = getPieceAt(board, from);
      if (!piece || piece.color !== color) continue;

      for (let toRow = 0; toRow < 8; toRow++) {
        for (let toCol = 0; toCol < 8; toCol++) {
          const to = { row: toRow, col: toCol };
          if (fromRow === toRow && fromCol === toCol) continue;
          if (isValidMove(board, from, to, color, enPassantTarget)) return true;
        }
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// isCheckmate / isStalemate
// ---------------------------------------------------------------------------
export function isCheckmate(
  board: BoardState, 
  color: PieceColor,
  enPassantTarget?: Position | null
): boolean {
  return isKingInCheck(board, color) && !hasLegalMoves(board, color, enPassantTarget);
}

export function isStalemate(
  board: BoardState, 
  color: PieceColor,
  enPassantTarget?: Position | null
): boolean {
  return !isKingInCheck(board, color) && !hasLegalMoves(board, color, enPassantTarget);
}

// ---------------------------------------------------------------------------
// FEN, Threefold Repetition & 50-Move Rule
// ---------------------------------------------------------------------------
export function getBoardFen(board: BoardState, turn: PieceColor, enPassantTarget?: Position | null): string {
  let fen = '';
  for (let r = 0; r < 8; r++) {
    let emptyCount = 0;
    for (let c = 0; c < 8; c++) {
      const piece = board[positionToKey({ row: r, col: c })];
      if (!piece) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          fen += emptyCount;
          emptyCount = 0;
        }
        const letter = piece.type === 'knight' ? 'N' : piece.type[0].toUpperCase();
        fen += piece.color === 'white' ? letter : letter.toLowerCase();
      }
    }
    if (emptyCount > 0) fen += emptyCount;
    if (r < 7) fen += '/';
  }
  fen += ` ${turn[0]}`;
  if (enPassantTarget) {
    fen += ` ${positionToAlgebraic(enPassantTarget)}`;
  } else {
    fen += ' -';
  }
  return fen;
}

export function isThreefoldRepetition(positionHistory: string[]): boolean {
  if (!positionHistory || positionHistory.length < 5) return false;
  const counts: Record<string, number> = {};
  for (const pos of positionHistory) {
    counts[pos] = (counts[pos] || 0) + 1;
    if (counts[pos] >= 3) return true;
  }
  return false;
}

export function isFiftyMoveRule(halfmoveClock: number): boolean {
  return halfmoveClock >= 100;
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------
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
