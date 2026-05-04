import { useState, useRef } from 'react';
import { BoardState, ChessPiece, PieceColor, Position } from '../types/chess';
import { positionToKey, isValidMove } from '../lib/chessLogic';

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
  const [draggedPiece, setDraggedPiece] = useState<Position | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

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

  const handleDragStart = (e: React.DragEvent, row: number, col: number) => {
    if (!isActive || !playerColor || currentTurn !== playerColor) {
      e.preventDefault();
      return;
    }

    const piece = board[positionToKey({ row, col })];
    if (piece && piece.color === playerColor) {
      setDraggedPiece({ row, col });
      calculateValidMoves({ row, col });
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, toRow: number, toCol: number) => {
    e.preventDefault();
    if (draggedPiece) {
      const isValidMoveAttempt = validMoves.some(
        pos => pos.row === toRow && pos.col === toCol
      );

      if (isValidMoveAttempt) {
        onMove(draggedPiece, { row: toRow, col: toCol });
      }

      setDraggedPiece(null);
      setSelectedSquare(null);
      setValidMoves([]);
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
            Playing as {playerColor}
          </div>
        )}
      </div>

      <div
        ref={boardRef}
        className="inline-block bg-gray-800 p-4 rounded-lg shadow-2xl"
        onDragOver={handleDragOver}
      >
        <div className="grid grid-cols-8 gap-0 border-2 border-gray-900 rounded-[2px] overflow-hidden">
          {Array.from({ length: 8 }, (_, vRow) =>
            Array.from({ length: 8 }, (_, vCol) => {
              const isBlack = playerColor === 'black';
              const row = isBlack ? 7 - vRow : vRow;
              const col = isBlack ? 7 - vCol : vCol;

              const piece = board[positionToKey({ row, col })];
              const isLight = (row + col) % 2 === 0;
              const isSelected = isSquareSelected(row, col);
              const isValidMove = isValidMoveSquare(row, col);
              const isDragging = draggedPiece?.row === row && draggedPiece?.col === col;

              return (
                <div
                  key={`${row}-${col}`}
                  onClick={() => handleSquareClick(row, col)}
                  onDragStart={(e) => handleDragStart(e, row, col)}
                  onDrop={(e) => handleDrop(e, row, col)}
                  onDragOver={handleDragOver}
                  draggable={!!piece && piece.color === playerColor && isActive}
                  className={`
                    w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center
                    text-5xl sm:text-6xl cursor-pointer relative
                    transition-all duration-150
                    ${isDragging ? 'opacity-50' : ''}
                    ${piece && piece.color === playerColor && isActive ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                    ${!isActive || !playerColor || currentTurn !== playerColor ? 'opacity-75' : 'hover:brightness-95'}
                  `}
                  style={{
                    backgroundColor: isSelected ? 'rgba(255, 255, 0, 0.5)' : isLight ? '#dee3e6' : '#8ca2ad'
                  }}
                >
                  {vCol === 0 && (
                    <div className="absolute left-1 top-1 text-xs font-semibold"
                         style={{ color: isLight ? '#8ca2ad' : '#dee3e6' }}>
                      {ranks[row]}
                    </div>
                  )}
                  {vRow === 7 && (
                    <div className="absolute right-1 bottom-1 text-xs font-semibold"
                         style={{ color: isLight ? '#8ca2ad' : '#dee3e6' }}>
                      {files[col]}
                    </div>
                  )}
                  <span className={`select-none ${piece?.color === 'white' ? 'drop-shadow-md' : ''} ${isDragging ? 'opacity-30' : ''}`}>
                    {getPieceSymbol(piece)}
                  </span>
                  {isValidMove && !piece && (
                    <div className="absolute w-4 h-4 bg-green-500 rounded-full"></div>
                  )}
                  {isValidMove && piece && (
                    <div className="absolute inset-0 border-4 border-red-500 pointer-events-none"></div>
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
