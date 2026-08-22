import { useState, useRef } from 'react';
import { BoardState, PieceColor, Position, PieceType } from '../types/chess';
import { positionToKey, isValidMove, isKingInCheck, isPromotionMove } from '../lib/chessLogic';
import { X } from 'lucide-react';

interface ChessBoardProps {
  board: BoardState;
  currentTurn: PieceColor;
  playerColor: PieceColor | null;
  onMove?: (from: Position, to: Position, promotion?: PieceType) => void;
  isActive?: boolean;
  lastMoveFrom?: Position | null;
  lastMoveTo?: Position | null;
  enPassantTarget?: Position | null;
}

export default function ChessBoard({
  board,
  currentTurn,
  playerColor,
  onMove = () => {},
  isActive = false,
  lastMoveFrom,
  lastMoveTo,
  enPassantTarget = null,
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [draggedPiece, setDraggedPiece] = useState<Position | null>(null);
  const [touchDragState, setTouchDragState] = useState<{ x: number; y: number; pieceSrc: string } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Position; to: Position } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const calculateValidMoves = (from: Position) => {
    const moves: Position[] = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const to: Position = { row, col };
        if (isValidMove(board, from, to, currentTurn, enPassantTarget)) {
          moves.push(to);
        }
      }
    }
    setValidMoves(moves);
    return moves;
  };

  const attemptMove = (from: Position, to: Position) => {
    if (isPromotionMove(board, from, to)) {
      setPendingPromotion({ from, to });
    } else {
      onMove(from, to);
    }
    setSelectedSquare(null);
    setValidMoves([]);
  };

  const handleSquareClick = (row: number, col: number) => {
    if (!isActive || !playerColor || currentTurn !== playerColor || pendingPromotion) return;

    const clickedPos: Position = { row, col };
    const piece = board[positionToKey(clickedPos)];

    if (selectedSquare) {
      const isValidMoveAttempt = validMoves.some(
        pos => pos.row === row && pos.col === col
      );

      if (isValidMoveAttempt) {
        attemptMove(selectedSquare, clickedPos);
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

  // HTML5 Drag Handlers (Mouse)
  const handleDragStart = (e: React.DragEvent, row: number, col: number) => {
    if (!isActive || !playerColor || currentTurn !== playerColor || pendingPromotion) {
      e.preventDefault();
      return;
    }

    const piece = board[positionToKey({ row, col })];
    if (piece && piece.color === playerColor) {
      setDraggedPiece({ row, col });
      setSelectedSquare({ row, col });
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
        attemptMove(draggedPiece, { row: toRow, col: toCol });
      }

      setDraggedPiece(null);
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  // Touch Handlers (Mobile & Tablets)
  const handleTouchStart = (e: React.TouchEvent, row: number, col: number) => {
    if (!isActive || !playerColor || currentTurn !== playerColor || pendingPromotion) return;

    const piece = board[positionToKey({ row, col })];
    if (piece && piece.color === playerColor) {
      const touch = e.touches[0];
      const fromPos = { row, col };
      setDraggedPiece(fromPos);
      setSelectedSquare(fromPos);
      const computedMoves = calculateValidMoves(fromPos);

      const pieceSrc = `/assets/pieces/${piece.color === 'white' ? 'w' : 'b'}_${piece.type}.svg`;
      setTouchDragState({
        x: touch.clientX,
        y: touch.clientY,
        pieceSrc
      });

      if (computedMoves.length > 0) {
        e.stopPropagation();
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (draggedPiece && touchDragState) {
      const touch = e.touches[0];
      setTouchDragState(prev => prev ? { ...prev, x: touch.clientX, y: touch.clientY } : null);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (draggedPiece && touchDragState) {
      const touch = e.changedTouches[0];
      const targetElem = document.elementFromPoint(touch.clientX, touch.clientY);
      const squareElem = targetElem?.closest('[data-square-row]');

      if (squareElem) {
        const toRow = parseInt(squareElem.getAttribute('data-square-row') || '-1', 10);
        const toCol = parseInt(squareElem.getAttribute('data-square-col') || '-1', 10);

        if (toRow >= 0 && toCol >= 0) {
          const isValidAttempt = validMoves.some(pos => pos.row === toRow && pos.col === toCol);
          if (isValidAttempt) {
            attemptMove(draggedPiece, { row: toRow, col: toCol });
          }
        }
      }

      setDraggedPiece(null);
      setTouchDragState(null);
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  const handlePromotionSelect = (chosenPiece: PieceType) => {
    if (!pendingPromotion) return;
    onMove(pendingPromotion.from, pendingPromotion.to, chosenPiece);
    setPendingPromotion(null);
  };

  const isSquareSelected = (row: number, col: number) => {
    return selectedSquare?.row === row && selectedSquare?.col === col;
  };

  const isValidMoveSquare = (row: number, col: number) => {
    return validMoves.some(pos => pos.row === row && pos.col === col);
  };

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

  const inCheck = isKingInCheck(board, currentTurn);
  const activeColor = playerColor || currentTurn;

  return (
    <div
      ref={boardRef}
      className="grid grid-cols-8 grid-rows-8 gap-0 w-full h-full select-none touch-none relative rounded-lg overflow-hidden"
      onDragOver={handleDragOver}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
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

          let squareBgColor = isLight ? '#dee3e6' : '#8ca2ad';
          if (isSelected) {
            squareBgColor = 'rgba(139, 92, 246, 0.55)';
          } else if (isKingInCheckSquare) {
            squareBgColor = 'rgba(239, 68, 68, 0.55)';
          } else if (isLastFrom) {
            squareBgColor = 'rgba(205, 210, 106, 0.55)';
          } else if (isLastTo) {
            squareBgColor = 'rgba(205, 210, 106, 0.75)';
          }

          return (
            <div
              key={`${row}-${col}`}
              data-square-row={row}
              data-square-col={col}
              onClick={() => handleSquareClick(row, col)}
              onDragStart={(e) => handleDragStart(e, row, col)}
              onDrop={(e) => handleDrop(e, row, col)}
              onDragOver={handleDragOver}
              onTouchStart={(e) => handleTouchStart(e, row, col)}
              draggable={!!piece && piece.color === playerColor && isActive}
              className={`
                w-full h-full flex items-center justify-center
                cursor-pointer relative
                transition-all duration-150
                ${isDragging ? 'opacity-40' : ''}
                ${piece && piece.color === playerColor && isActive ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                ${!isActive || !playerColor || currentTurn !== playerColor ? 'opacity-90' : 'hover:brightness-95'}
              `}
              style={{ backgroundColor: squareBgColor }}
            >
              {vCol === 0 && (
                <div className="absolute left-1 top-0.5 text-[9px] font-bold pointer-events-none select-none"
                     style={{ color: isLight ? '#8ca2ad' : '#dee3e6' }}>
                  {ranks[row]}
                </div>
              )}
              {vRow === 7 && (
                <div className="absolute right-1 bottom-0.5 text-[9px] font-bold pointer-events-none select-none"
                     style={{ color: isLight ? '#8ca2ad' : '#dee3e6' }}>
                  {files[col]}
                </div>
              )}
              {piece && (
                <img
                  src={`/assets/pieces/${piece.color === 'white' ? 'w' : 'b'}_${piece.type}.svg`}
                  alt={`${piece.color} ${piece.type}`}
                  draggable={false}
                  className={`w-[84%] h-[84%] object-contain select-none pointer-events-none drop-shadow-[0_3px_5px_rgba(0,0,0,0.45)] z-10 transition-transform ${isDragging ? 'opacity-20 scale-90' : ''}`}
                />
              )}
              {isValidMove && !piece && (
                <div className="absolute w-3.5 h-3.5 bg-slate-900/35 rounded-full pointer-events-none z-20 animate-pulse"></div>
              )}
              {isValidMove && piece && (
                <div className="absolute inset-0 border-4 border-slate-900/35 pointer-events-none z-20"></div>
              )}
            </div>
          );
        })
      )}

      {/* Underpromotion 4-Choice Modal Overlay */}
      {pendingPromotion && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md z-40 flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-4 shadow-2xl max-w-[280px] w-full text-center relative">
            <button
              onClick={() => setPendingPromotion(null)}
              className="absolute top-2.5 right-2.5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              title="Cancel promotion"
            >
              <X size={16} />
            </button>
            <h3 className="text-xs font-black uppercase tracking-wider text-white mb-1">Pawn Promotion</h3>
            <p className="text-[11px] text-slate-400 mb-3">Choose a piece to promote to:</p>
            <div className="grid grid-cols-4 gap-2">
              {(['queen', 'knight', 'rook', 'bishop'] as const).map((pType) => (
                <button
                  key={pType}
                  onClick={() => handlePromotionSelect(pType)}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-950 hover:bg-violet-600/20 border border-slate-800 hover:border-violet-500 transition-all group active:scale-95"
                >
                  <img
                    src={`/assets/pieces/${activeColor === 'white' ? 'w' : 'b'}_${pType}.svg`}
                    alt={pType}
                    className="w-10 h-10 object-contain drop-shadow-md group-hover:scale-110 transition-transform"
                  />
                  <span className="text-[9px] font-bold text-slate-400 group-hover:text-violet-300 capitalize mt-1">
                    {pType}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Touch Floating Drag Ghost Element */}
      {touchDragState && (
        <div
          className="fixed pointer-events-none z-50 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 transition-none"
          style={{
            left: `${touchDragState.x}px`,
            top: `${touchDragState.y}px`
          }}
        >
          <img
            src={touchDragState.pieceSrc}
            alt="Dragging piece"
            className="w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)] scale-125"
          />
        </div>
      )}
    </div>
  );
}
