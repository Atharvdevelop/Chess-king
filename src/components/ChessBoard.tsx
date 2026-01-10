import { useState } from 'react';
import { BoardState, ChessPiece, PieceColor, Position } from '../types/chess';
import { positionToKey, isValidMove, makeMove } from '../lib/chessLogic';

interface ChessBoardProps {
  board: BoardState;
  currentTurn: PieceColor;
  playerColor: PieceColor | null;
  onMove: (from: Position, to: Position) => void;
  isActive: boolean;
}

const pieceSymbols: Record<string, string> = {
  'white-king': '♔',
  'white-queen': '♕',
  'white-rook': '♖',
  'white-bishop': '♗',
  'white-knight': '♘',
  'white-pawn': '♙',
  'black-king': '♚',
  'black-queen': '♛',
  'black-rook': '♜',
  'black-bishop': '♝',
  'black-knight': '♞',
  'black-pawn': '♟',
};

export default function ChessBoard({ board, currentTurn, playerColor, onMove, isActive }: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);

  const handleSquareClick = (row: number, col: number) => {
    if (!isActive || !playerColor || currentTurn !== playerColor) return;

    const clickedPos: Position = { row, col };
    const piece = board[positionToKey(clickedPos)];

    if (selectedSquare) {
      const isValidMoveAttempt = validMoves.some(
        pos => pos.row === row && pos.col === col
      );

      if (isValidMoveAttempt) {
        onMove(selectedSquare, clickedPos);
        setSelectedSquare(null);
        setValidMoves([]);
      } else if (piece && piece.color === playerColor) {
        setSelectedSquare(clickedPos);
        calculateValidMoves(clickedPos);
      } else {
        setSelectedSquare(null);
        setValidMoves([]);
      }
    } else if (piece && piece.color === playerColor) {
      setSelectedSquare(clickedPos);
      calculateValidMoves(clickedPos);
    }
  };

  const calculateValidMoves = (from: Position) => {
    const moves: Position[] = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const to: Position = { row, col };
        if (isValidMove(board, from, to, currentTurn)) {
          moves.push(to);
        }
      }
    }
    setValidMoves(moves);
  };

  const isSquareSelected = (row: number, col: number) => {
    return selectedSquare?.row === row && selectedSquare?.col === col;
  };

  const isValidMoveSquare = (row: number, col: number) => {
    return validMoves.some(pos => pos.row === row && pos.col === col);
  };

  const getPieceSymbol = (piece: ChessPiece | null) => {
    if (!piece) return '';
    return pieceSymbols[`${piece.color}-${piece.type}`];
  };

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4 text-center">
        <div className="text-sm text-gray-600">
          {isActive ? (
            <>
              <span className={`font-semibold ${currentTurn === 'white' ? 'text-gray-900' : 'text-gray-700'}`}>
                {currentTurn === 'white' ? 'White' : 'Black'}
              </span> to move
            </>
          ) : (
            <span className="text-gray-500">Waiting for opponent...</span>
          )}
        </div>
        {playerColor && (
          <div className="text-xs text-gray-500 mt-1">
            You are playing as {playerColor}
          </div>
        )}
      </div>

      <div className="inline-block bg-gray-800 p-4 rounded-lg shadow-2xl">
        <div className="grid grid-cols-8 gap-0 border-2 border-gray-900">
          {Array.from({ length: 8 }, (_, row) =>
            Array.from({ length: 8 }, (_, col) => {
              const piece = board[positionToKey({ row, col })];
              const isLight = (row + col) % 2 === 0;
              const isSelected = isSquareSelected(row, col);
              const isValidMove = isValidMoveSquare(row, col);

              return (
                <div
                  key={`${row}-${col}`}
                  onClick={() => handleSquareClick(row, col)}
                  className={`
                    w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center
                    text-5xl sm:text-6xl cursor-pointer relative
                    transition-all duration-150
                    ${isLight ? 'bg-amber-100' : 'bg-amber-700'}
                    ${isSelected ? 'ring-4 ring-blue-500 ring-inset' : ''}
                    ${isValidMove ? 'ring-4 ring-green-400 ring-inset' : ''}
                    ${!isActive || !playerColor || currentTurn !== playerColor ? 'cursor-not-allowed opacity-80' : 'hover:brightness-95'}
                  `}
                >
                  {col === 0 && (
                    <div className="absolute left-1 top-1 text-xs font-semibold"
                         style={{ color: isLight ? '#92400e' : '#fef3c7' }}>
                      {ranks[row]}
                    </div>
                  )}
                  {row === 7 && (
                    <div className="absolute right-1 bottom-1 text-xs font-semibold"
                         style={{ color: isLight ? '#92400e' : '#fef3c7' }}>
                      {files[col]}
                    </div>
                  )}
                  <span className={`select-none ${piece?.color === 'white' ? 'drop-shadow-md' : ''}`}>
                    {getPieceSymbol(piece)}
                  </span>
                  {isValidMove && !piece && (
                    <div className="absolute w-4 h-4 bg-green-500 rounded-full opacity-50"></div>
                  )}
                  {isValidMove && piece && (
                    <div className="absolute inset-0 border-4 border-red-500 opacity-50 pointer-events-none"></div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
