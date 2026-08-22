import { useState } from 'react';
import { BoardState, PieceColor, Position, PieceType } from '../types/chess';
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
  const [enPassantHistory, setEnPassantHistory] = useState<(Position | null)[]>([null]);
  const [currentTurn, setCurrentTurn] = useState<PieceColor>('white');
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);

  const currentBoard = boardHistory[boardHistory.length - 1];
  const currentEnPassant = enPassantHistory[enPassantHistory.length - 1];

  // Check state
  const isWhiteCheck = isKingInCheck(currentBoard, 'white');
  const isBlackCheck = isKingInCheck(currentBoard, 'black');
  const isWhiteMate = isCheckmate(currentBoard, 'white', currentEnPassant);
  const isBlackMate = isCheckmate(currentBoard, 'black', currentEnPassant);

  const handleMove = (from: Position, to: Position, promotion: PieceType = 'queen') => {
    if (isWhiteMate || isBlackMate) return;

    const { newBoard, newEnPassantTarget, isPromotion } = makeMove(
      currentBoard, 
      from, 
      to, 
      promotion, 
      currentEnPassant
    );
    const promoSuffix = isPromotion ? `=${promotion[0].toUpperCase()}` : '';
    const notation = `${positionToAlgebraic(from)}-${positionToAlgebraic(to)}${promoSuffix}`;
    const nextTurn = currentTurn === 'white' ? 'black' : 'white';

    setBoardHistory(prev => [...prev, newBoard]);
    setEnPassantHistory(prev => [...prev, newEnPassantTarget]);
    setMoveHistory(prev => [...prev, notation]);
    setCurrentTurn(nextTurn);
  };

  const handleUndo = () => {
    if (boardHistory.length <= 1) return;
    setBoardHistory(prev => prev.slice(0, prev.length - 1));
    setEnPassantHistory(prev => prev.slice(0, prev.length - 1));
    setMoveHistory(prev => prev.slice(0, prev.length - 1));
    setCurrentTurn(prev => (prev === 'white' ? 'black' : 'white'));
  };

  const handleReset = () => {
    setBoardHistory([createInitialBoard()]);
    setEnPassantHistory([null]);
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
              enPassantTarget={currentEnPassant}
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
              className="bg-slate-900 hover:bg-rose-950/40 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 border border-slate-800 font-bold py-2.5 px-4 rounded-xl transition-all text-xs flex items-center justify-center gap-2 shadow-lg"
            >
              Reset
            </button>
          </div>

        </div>

        {/* Right: Move History Panel */}
        <div 
          className="w-full lg:w-72 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col shadow-xl backdrop-blur-md"
          style={{ height: 'min(65vmin, calc(100vh - 220px), 520px)' }}
        >
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
            <span>Move Notation</span>
            <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-400">
              {moveHistory.length} moves
            </span>
          </h2>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
            {moveHistory.length === 0 ? (
              <p className="text-slate-600 text-xs py-8 text-center font-mono">No moves played yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {moveHistory.map((m, idx) => (
                  <div
                    key={idx}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
                      idx % 2 === 0
                        ? 'bg-slate-950/40 border-slate-800 text-slate-300'
                        : 'bg-slate-900/40 border-slate-800/60 text-slate-400'
                    }`}
                  >
                    <span className="text-[10px] text-slate-500">{Math.floor(idx / 2) + 1}{idx % 2 === 0 ? '.' : '...'}</span>
                    <span className="font-semibold text-slate-200">{m}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
