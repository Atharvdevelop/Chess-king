import { useState } from 'react';
import { BoardState, PieceColor, Position } from '../types/chess';
import {
  createInitialBoard,
  getPieceAt,
  isValidMove,
  makeMove,
  isKingInCheck,
  isCheckmate,
  positionToAlgebraic
} from '../lib/chessLogic';
import { ArrowLeft, RotateCcw, RefreshCw, Layers } from 'lucide-react';

interface OfflineGameViewProps {
  onBack: () => void;
}

// Unicode representation for high-fidelity chess piece icons
const PIECE_UNICODE: Record<string, Record<PieceColor, string>> = {
  pawn: { white: '♙', black: '♟' },
  rook: { white: '♖', black: '♜' },
  knight: { white: '♘', black: '♞' },
  bishop: { white: '♗', black: '♝' },
  queen: { white: '♕', black: '♛' },
  king: { white: '♔', black: '♚' }
};

export default function OfflineGameView({ onBack }: OfflineGameViewProps) {
  const [boardHistory, setBoardHistory] = useState<BoardState[]>([createInitialBoard()]);
  const [currentTurn, setCurrentTurn] = useState<PieceColor>('white');
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);

  const currentBoard = boardHistory[boardHistory.length - 1];

  // Check state
  const isWhiteCheck = isKingInCheck(currentBoard, 'white');
  const isBlackCheck = isKingInCheck(currentBoard, 'black');
  const isWhiteMate = isCheckmate(currentBoard, 'white');
  const isBlackMate = isCheckmate(currentBoard, 'black');

  const handleSquareClick = (row: number, col: number) => {
    if (isWhiteMate || isBlackMate) return;

    const clickedPos = { row, col };
    const clickedPiece = getPieceAt(currentBoard, clickedPos);

    if (selectedPos) {
      if (selectedPos.row === row && selectedPos.col === col) {
        setSelectedPos(null);
        return;
      }

      // If clicked on another piece of the same turn color, change selection
      if (clickedPiece && clickedPiece.color === currentTurn) {
        setSelectedPos(clickedPos);
        return;
      }

      // Try making move
      if (isValidMove(currentBoard, selectedPos, clickedPos, currentTurn)) {
        const { newBoard } = makeMove(currentBoard, selectedPos, clickedPos);
        const notation = `${positionToAlgebraic(selectedPos)}-${positionToAlgebraic(clickedPos)}`;
        const nextTurn = currentTurn === 'white' ? 'black' : 'white';

        setBoardHistory(prev => [...prev, newBoard]);
        setMoveHistory(prev => [...prev, notation]);
        setCurrentTurn(nextTurn);
        setSelectedPos(null);
        return;
      }
    }

    if (clickedPiece && clickedPiece.color === currentTurn) {
      setSelectedPos(clickedPos);
    }
  };

  const handleUndo = () => {
    if (boardHistory.length <= 1) return;
    setBoardHistory(prev => prev.slice(0, prev.length - 1));
    setMoveHistory(prev => prev.slice(0, prev.length - 1));
    setCurrentTurn(prev => (prev === 'white' ? 'black' : 'white'));
    setSelectedPos(null);
  };

  const handleReset = () => {
    setBoardHistory([createInitialBoard()]);
    setMoveHistory([]);
    setCurrentTurn('white');
    setSelectedPos(null);
  };

  // Get valid target squares for highlights
  const validTargets: Position[] = [];
  if (selectedPos) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (isValidMove(currentBoard, selectedPos, { row: r, col: c }, currentTurn)) {
          validTargets.push({ row: r, col: c });
        }
      }
    }
  }

  const renderSquare = (row: number, col: number) => {
    const piece = getPieceAt(currentBoard, { row, col });
    const isDark = (row + col) % 2 === 1;
    const isSelected = selectedPos?.row === row && selectedPos?.col === col;
    const isValidTarget = validTargets.some(p => p.row === row && p.col === col);
    
    const isKingInCheck = 
      piece?.type === 'king' && 
      ((piece.color === 'white' && isWhiteCheck) || (piece.color === 'black' && isBlackCheck));

    return (
      <button
        key={`${row}-${col}`}
        onClick={() => handleSquareClick(row, col)}
        className={`relative aspect-square flex items-center justify-center text-3xl sm:text-4xl transition-all duration-150 select-none ${
          isDark ? 'bg-slate-800' : 'bg-slate-700'
        } ${isSelected ? '!bg-amber-500/40 ring-2 ring-amber-400' : ''} ${
          isKingInCheck ? '!bg-rose-600/60 animate-pulse' : ''
        } hover:opacity-90`}
      >
        {/* Row & Col coordinates */}
        {col === (flipped ? 7 : 0) && (
          <span className={`absolute top-1 left-1.5 text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-300'}`}>
            {8 - row}
          </span>
        )}
        {row === (flipped ? 0 : 7) && (
          <span className={`absolute bottom-1 right-1.5 text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-300'}`}>
            {String.fromCharCode(97 + col)}
          </span>
        )}

        {/* Valid move indicator dot or capture ring */}
        {isValidTarget && (
          <div className={`absolute w-3.5 h-3.5 rounded-full ${piece ? 'ring-4 ring-emerald-400/80 bg-transparent scale-110' : 'bg-emerald-400/70'} pointer-events-none z-10 animate-scale-up`} />
        )}

        {/* Piece Icon */}
        {piece && (
          <span className={`z-0 transition-transform ${piece.color === 'white' ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : 'text-slate-950 drop-shadow-[0_1px_2px_rgba(255,255,255,0.4)]'}`}>
            {PIECE_UNICODE[piece.type][piece.color]}
          </span>
        )}
      </button>
    );
  };

  const rows = Array.from({ length: 8 }, (_, i) => (flipped ? 7 - i : i));
  const cols = Array.from({ length: 8 }, (_, i) => (flipped ? 7 - i : i));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-8 flex flex-col items-center antialiased">
      
      {/* Top Header */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl transition-all text-xs font-bold"
        >
          <ArrowLeft size={16} />
          Back to Lobby
        </button>

        <div className="text-center">
          <h1 className="text-xl font-black text-white flex items-center justify-center gap-2">
            <Layers className="w-5 h-5 text-violet-400" />
            Offline Pass & Play / Analysis
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">2 Players on 1 Device • Sandbox Board</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFlipped(!flipped)}
            className="flex items-center gap-1.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white px-3 py-2.5 rounded-xl transition-all text-xs font-bold"
            title="Flip Board"
          >
            <RefreshCw size={14} />
            <span className="hidden sm:inline">Flip</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Board & Game Sidebar */}
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left/Center: Chess Board Container */}
        <div className="lg:col-span-2 flex flex-col items-center">
          
          {/* Top Player Turn Indicator */}
          <div className="w-full max-w-md mb-3 flex justify-between items-center bg-slate-900/60 border border-slate-800 px-4 py-2.5 rounded-xl backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <span className={`w-3 h-3 rounded-full ${currentTurn === 'white' ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-slate-950 border border-slate-700'}`} />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                {currentTurn}'s Turn
              </span>
            </div>
            {isWhiteMate && <span className="text-xs font-black text-rose-400">Black Wins by Checkmate!</span>}
            {isBlackMate && <span className="text-xs font-black text-emerald-400">White Wins by Checkmate!</span>}
            {!isWhiteMate && !isBlackMate && (isWhiteCheck || isBlackCheck) && (
              <span className="text-xs font-bold text-amber-400 animate-bounce">CHECK!</span>
            )}
          </div>

          {/* 8x8 Chess Board */}
          <div className="w-full max-w-md aspect-square grid grid-cols-8 rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-800 bg-slate-900">
            {rows.map(r => cols.map(c => renderSquare(r, c)))}
          </div>

          {/* Action Control Buttons */}
          <div className="w-full max-w-md mt-4 flex gap-3">
            <button
              onClick={handleUndo}
              disabled={boardHistory.length <= 1}
              className="flex-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-800 text-slate-200 font-bold py-2.5 px-4 rounded-xl transition-all text-xs flex items-center justify-center gap-2"
            >
              <RotateCcw size={14} />
              Undo Move
            </button>
            <button
              onClick={handleReset}
              className="flex-1 bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-300 font-bold py-2.5 px-4 rounded-xl transition-all text-xs flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} />
              Reset Board
            </button>
          </div>
        </div>

        {/* Right Sidebar: Move Notation History */}
        <div className="bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col h-[460px]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex justify-between items-center">
            <span>Move Notation History</span>
            <span className="text-[10px] text-slate-500 font-mono">{moveHistory.length} Moves</span>
          </h3>

          <div className="flex-1 overflow-y-auto bg-slate-950/50 rounded-xl border border-slate-850 p-3 space-y-1.5 custom-scrollbar font-mono text-xs">
            {moveHistory.length === 0 ? (
              <p className="text-slate-600 italic text-center py-16 font-sans">No moves made yet.<br />Click a piece to play!</p>
            ) : (
              Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, idx) => {
                const whiteMove = moveHistory[idx * 2];
                const blackMove = moveHistory[idx * 2 + 1];
                return (
                  <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-850/40 px-2 rounded hover:bg-slate-900/40">
                    <span className="text-slate-500 w-8">{idx + 1}.</span>
                    <span className="text-violet-300 font-bold flex-1">{whiteMove}</span>
                    <span className="text-cyan-300 font-bold flex-1 text-right">{blackMove || ''}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
