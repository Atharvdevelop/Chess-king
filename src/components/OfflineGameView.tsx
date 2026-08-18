import { useState } from 'react';
import { BoardState, PieceColor, Position } from '../types/chess';
import {
  createInitialBoard,
  makeMove,
  isKingInCheck,
  isCheckmate,
  positionToAlgebraic
} from '../lib/chessLogic';
import ChessBoard from './ChessBoard';
import { ArrowLeft, RotateCcw, RefreshCw, Layers } from 'lucide-react';

interface OfflineGameViewProps {
  onBack: () => void;
}

export default function OfflineGameView({ onBack }: OfflineGameViewProps) {
  const [boardHistory, setBoardHistory] = useState<BoardState[]>([createInitialBoard()]);
  const [currentTurn, setCurrentTurn] = useState<PieceColor>('white');
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);

  const currentBoard = boardHistory[boardHistory.length - 1];

  // Check state
  const isWhiteCheck = isKingInCheck(currentBoard, 'white');
  const isBlackCheck = isKingInCheck(currentBoard, 'black');
  const isWhiteMate = isCheckmate(currentBoard, 'white');
  const isBlackMate = isCheckmate(currentBoard, 'black');

  const handleMove = (from: Position, to: Position) => {
    if (isWhiteMate || isBlackMate) return;

    const { newBoard } = makeMove(currentBoard, from, to);
    const notation = `${positionToAlgebraic(from)}-${positionToAlgebraic(to)}`;
    const nextTurn = currentTurn === 'white' ? 'black' : 'white';

    setBoardHistory(prev => [...prev, newBoard]);
    setMoveHistory(prev => [...prev, notation]);
    setCurrentTurn(nextTurn);
  };

  const handleUndo = () => {
    if (boardHistory.length <= 1) return;
    setBoardHistory(prev => prev.slice(0, prev.length - 1));
    setMoveHistory(prev => prev.slice(0, prev.length - 1));
    setCurrentTurn(prev => (prev === 'white' ? 'black' : 'white'));
  };

  const handleReset = () => {
    setBoardHistory([createInitialBoard()]);
    setMoveHistory([]);
    setCurrentTurn('white');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-8 flex flex-col items-center antialiased overflow-y-auto custom-scrollbar">
      
      {/* Top Header */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl transition-all text-xs font-bold shadow-lg"
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
            className="flex items-center gap-1.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white px-3.5 py-2.5 rounded-xl transition-all text-xs font-bold shadow-lg"
            title="Flip Board View"
          >
            <RefreshCw size={14} />
            <span className="hidden sm:inline">Flip</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Board & Game Sidebar */}
      <div className="w-full max-w-4xl flex flex-col lg:flex-row gap-6 items-center lg:items-start justify-center">
        
        {/* Left/Center: Chess Board Container */}
        <div className="flex flex-col items-center shrink-0">
          
          {/* Top Player Turn Indicator */}
          <div 
            className="mb-3 flex justify-between items-center bg-slate-900/60 border border-slate-800 px-4 py-2 rounded-xl backdrop-blur-md shadow-md"
            style={{ width: 'min(65vmin, calc(100vh - 220px), 520px)' }}
          >
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

          {/* Responsive Board Frame */}
          <div
            className="bg-slate-900 border-2 border-slate-800 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] overflow-hidden relative"
            style={{ 
              width: 'min(65vmin, calc(100vh - 220px), 520px)', 
              height: 'min(65vmin, calc(100vh - 220px), 520px)' 
            }}
          >
            <ChessBoard
              board={currentBoard}
              currentTurn={currentTurn}
              playerColor={flipped ? (currentTurn === 'white' ? 'black' : 'white') : currentTurn}
              onMove={handleMove}
              isActive={!isWhiteMate && !isBlackMate}
            />
          </div>

          {/* Action Control Buttons */}
          <div 
            className="mt-4 flex gap-3"
            style={{ width: 'min(65vmin, calc(100vh - 220px), 520px)' }}
          >
            <button
              onClick={handleUndo}
              disabled={boardHistory.length <= 1}
              className="flex-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-800 text-slate-200 font-bold py-2.5 px-4 rounded-xl transition-all text-xs flex items-center justify-center gap-2 shadow-lg"
            >
              <RotateCcw size={14} />
              Undo Move
            </button>
            <button
              onClick={handleReset}
              className="flex-1 bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-300 font-bold py-2.5 px-4 rounded-xl transition-all text-xs flex items-center justify-center gap-2 shadow-lg"
            >
              <RefreshCw size={14} />
              Reset Board
            </button>
          </div>
        </div>

        {/* Right Sidebar: Move Notation History */}
        <div 
          className="w-full lg:w-[300px] xl:w-[340px] bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col h-[260px] lg:h-[min(65vmin,calc(100vh-220px),520px)]"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex justify-between items-center">
            <span>Move Notation History</span>
            <span className="text-[10px] text-slate-500 font-mono">{moveHistory.length} Moves</span>
          </h3>

          <div className="flex-1 overflow-y-auto bg-slate-950/50 rounded-xl border border-slate-850 p-3 space-y-1.5 custom-scrollbar font-mono text-xs">
            {moveHistory.length === 0 ? (
              <p className="text-slate-600 italic text-center py-16 font-sans">No moves made yet.<br />Drag or click a piece to play!</p>
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
