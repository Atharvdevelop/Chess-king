import { useState, useRef } from 'react';
import { BoardState, PieceColor, Position } from '../types/chess';
import { positionToKey, isValidMove, isKingInCheck } from '../lib/chessLogic';

interface ChessBoardProps {
  board: BoardState;
  currentTurn: PieceColor;
  playerColor: PieceColor | null;
  onMove: (from: Position, to: Position) => void;
  isActive: boolean;
  lastMoveFrom?: Position | null;
  lastMoveTo?: Position | null;
}

export default function ChessBoard({
  board,
  currentTurn,
  playerColor,
  onMove,
  isActive,
  lastMoveFrom,
  lastMoveTo,
}: ChessBoardProps) {
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

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

  // Check if current turn player's king is in check
  const inCheck = isKingInCheck(board, currentTurn);

  return (
    <div className="flex flex-col items-center select-none">
      <div className="mb-4 text-center">
        <div className="text-sm text-gray-400">
          {isActive ? (
            <>
              <span className={`font-semibold ${currentTurn === 'white' ? 'text-gray-100' : 'text-gray-300'}`}>
                {currentTurn === 'white' ? 'White' : 'Black'}
              </span> to move
            </>
          ) : (
            <span className="text-gray-500">Waiting for opponent...</span>
          )}
        </div>
        {playerColor && (
          <div className="text-xs text-violet-400 font-medium mt-1">
            Playing as {playerColor}
          </div>
        )}
      </div>

      <div
        ref={boardRef}
        className="inline-flex justify-center bg-slate-950 p-2 sm:p-4 rounded-lg shadow-2xl border border-slate-800"
        onDragOver={handleDragOver}
      >
        <div className="grid grid-cols-8 grid-rows-8 gap-0 border-2 border-slate-900 rounded-[2px] overflow-hidden w-[95vw] h-[95vw] lg:w-[600px] lg:h-[600px]">
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

              const isKingInCheckSquare = inCheck && piece && piece.type === 'king' && piece.color === currentTurn;
              const isLastFrom = lastMoveFrom?.row === row && lastMoveFrom?.col === col;
              const isLastTo = lastMoveTo?.row === row && lastMoveTo?.col === col;

              // Color determination
              let squareBgColor = isLight ? '#dee3e6' : '#8ca2ad';
              if (isSelected) {
                squareBgColor = 'rgba(139, 92, 246, 0.55)'; // Violet selection
              } else if (isKingInCheckSquare) {
                squareBgColor = 'rgba(239, 68, 68, 0.55)'; // Red check
              } else if (isLastFrom) {
                squareBgColor = 'rgba(205, 210, 106, 0.55)'; // Last move yellow-green
              } else if (isLastTo) {
                squareBgColor = 'rgba(205, 210, 106, 0.75)';
              }

              return (
                <div
                  key={`${row}-${col}`}
                  onClick={() => handleSquareClick(row, col)}
                  onDragStart={(e) => handleDragStart(e, row, col)}
                  onDrop={(e) => handleDrop(e, row, col)}
                  onDragOver={handleDragOver}
                  draggable={!!piece && piece.color === playerColor && isActive}
                  className={`
                    w-full h-full flex items-center justify-center
                    cursor-pointer relative
                    transition-all duration-150
                    ${isDragging ? 'opacity-50' : ''}
                    ${piece && piece.color === playerColor && isActive ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                    ${!isActive || !playerColor || currentTurn !== playerColor ? 'opacity-90' : 'hover:brightness-95'}
                  `}
                  style={{
                    backgroundColor: squareBgColor
                  }}
                >
                  {vCol === 0 && (
                    <div className="absolute left-1.5 top-1 text-[10px] font-bold"
                         style={{ color: isLight ? '#8ca2ad' : '#dee3e6' }}>
                      {ranks[row]}
                    </div>
                  )}
                  {vRow === 7 && (
                    <div className="absolute right-1.5 bottom-1 text-[10px] font-bold"
                         style={{ color: isLight ? '#8ca2ad' : '#dee3e6' }}>
                      {files[col]}
                    </div>
                  )}
                  {piece && (
                    <img
                      src={`/assets/pieces/${piece.color === 'white' ? 'w' : 'b'}_${piece.type}.svg`}
                      alt={`${piece.color} ${piece.type}`}
                      draggable={false}
                      className={`w-[84%] h-[84%] object-contain select-none pointer-events-none drop-shadow-[0_3px_5px_rgba(0,0,0,0.45)] z-10 transition-transform ${isDragging ? 'opacity-30' : ''}`}
                    />
                  )}
                  {isValidMove && !piece && (
                    <div className="absolute w-3.5 h-3.5 bg-slate-900/35 rounded-full pointer-events-none z-20"></div>
                  )}
                  {isValidMove && piece && (
                    <div className="absolute inset-0 border-4 border-slate-900/30 pointer-events-none z-20"></div>
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
