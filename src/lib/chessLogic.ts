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

// ---------------------------------------------------------------------------
// simulateMove
// ---------------------------------------------------------------------------
// Creates a scratch copy of the board, applies the move on it (without any
// side-effects like castling rook moves or promotion), and returns true only
// if the moving player's King is NOT in check on the resulting board.
// This is the universal self-check filter used by isValidMove.
export function simulateMove(
  board: BoardState,
  from: Position,
  to: Position,
  color: PieceColor
): boolean {
  // Shallow-copy is sufficient: we only write to specific keys.
  const scratch: BoardState = { ...board };
  const piece = scratch[positionToKey(from)];
  scratch[positionToKey(to)] = piece;
  scratch[positionToKey(from)] = null;
  return !isKingInCheck(scratch, color);
}

// ---------------------------------------------------------------------------
// isSquareAttackedBy
// ---------------------------------------------------------------------------
// Returns true if the given square is reachable by any piece of `attackerColor`
// using raw movement rules (no self-check filter — that would be recursive).
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
      // Use raw movement validators only — NOT isValidMove — to avoid
      // the simulateMove recursion that would cause infinite loops.
      if (canAttackSquare(board, pos, target, piece)) return true;
    }
  }
  return false;
}

// Raw attack check (no self-check filter, no turn check).
function canAttackSquare(
  board: BoardState,
  from: Position,
  to: Position,
  piece: ChessPiece
): boolean {
  const targetPiece = getPieceAt(board, to);
  // Cannot capture own piece.
  if (targetPiece && targetPiece.color === piece.color) return false;

  const dx = to.col - from.col;
  const dy = to.row - from.row;

  switch (piece.type) {
    case 'pawn': {
      const direction = piece.color === 'white' ? -1 : 1;
      // Pawns attack diagonally only.
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
      // King attacks adjacent squares only (no castling here).
      return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// isValidMove  (public — includes self-check filter via simulateMove)
// ---------------------------------------------------------------------------
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

  // Check the raw movement rule first.
  let rawOk = false;
  switch (piece.type) {
    case 'pawn':
      rawOk = isValidPawnMove(board, from, to, piece.color);
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

  // Self-check filter: the move is only legal if it does not leave the
  // moving player's King in check.
  return simulateMove(board, from, to, piece.color);
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

// isValidKingMove — raw movement only (self-check guard is in isValidMove).
// Destination square safety (attacked-square check) is enforced here.
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
    // King cannot step onto a square attacked by any enemy piece.
    return !isSquareAttackedBy(board, to, enemyColor);
  }

  // Castling
  if (Math.abs(dx) === 2 && dy === 0) {
    const piece = getPieceAt(board, from);
    if (piece && !piece.hasMoved) {
      // King must not currently be in check.
      if (isKingInCheck(board, color)) return false;

      const isKingside = dx > 0;
      const rookCol = isKingside ? 7 : 0;
      const rookPos = { row: from.row, col: rookCol };
      const rook = getPieceAt(board, rookPos);
      if (rook && rook.type === 'rook' && rook.color === color && !rook.hasMoved) {
        const step = Math.sign(dx);
        // Path between king and rook must be clear.
        for (let c = from.col + step; c !== rookCol; c += step) {
          if (getPieceAt(board, { row: from.row, col: c })) return false;
        }
        // Every square the king crosses must not be attacked.
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
// makeMove  (includes auto-promotion)
// ---------------------------------------------------------------------------
export function makeMove(
  board: BoardState,
  from: Position,
  to: Position
): { newBoard: BoardState; capturedPiece: ChessPiece | null } {
  const newBoard = { ...board };
  const piece = getPieceAt(board, from);
  const capturedPiece = getPieceAt(board, to);

  if (piece) {
    let movedPiece: ChessPiece = { ...piece, hasMoved: true };

    // Auto-promotion: pawn reaching the back rank becomes a queen.
    if (movedPiece.type === 'pawn' && (to.row === 0 || to.row === 7)) {
      movedPiece = { ...movedPiece, type: 'queen' };
    }

    newBoard[positionToKey(to)] = movedPiece;
  }
  newBoard[positionToKey(from)] = null;

  // Castling: move the rook to the other side of the king.
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
// Returns true if the given color has at least one fully legal move available
// (i.e. a move that passes isValidMove including the self-check filter).
export function hasLegalMoves(board: BoardState, color: PieceColor): boolean {
  for (let fromRow = 0; fromRow < 8; fromRow++) {
    for (let fromCol = 0; fromCol < 8; fromCol++) {
      const from = { row: fromRow, col: fromCol };
      const piece = getPieceAt(board, from);
      if (!piece || piece.color !== color) continue;

      for (let toRow = 0; toRow < 8; toRow++) {
        for (let toCol = 0; toCol < 8; toCol++) {
          const to = { row: toRow, col: toCol };
          if (fromRow === toRow && fromCol === toCol) continue;
          if (isValidMove(board, from, to, color)) return true;
        }
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// isCheckmate / isStalemate
// ---------------------------------------------------------------------------

// Checkmate: in check AND no legal moves.
export function isCheckmate(board: BoardState, color: PieceColor): boolean {
  return isKingInCheck(board, color) && !hasLegalMoves(board, color);
}

// Stalemate: not in check AND no legal moves.
export function isStalemate(board: BoardState, color: PieceColor): boolean {
  return !isKingInCheck(board, color) && !hasLegalMoves(board, color);
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
