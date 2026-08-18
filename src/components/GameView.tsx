import { useEffect, useState, useRef, useMemo } from 'react';
import { Game, PieceColor, Position, Move } from '../types/chess';
import { createInitialBoard, makeMove, algebraicToPosition } from '../lib/chessLogic';
import { getGame, makeGameMove, subscribeToGame, getMoves, endGameOnTimeout, endGame } from '../lib/gameService';
import ChessBoard from './ChessBoard';
import { ArrowLeft, Copy, Check } from 'lucide-react';

interface GameViewProps {
  gameId: string;
  profileId: string;   // unified auth UUID — matches games.white/black_player_id
  onBackToLobby: () => void;
}

export default function GameView({ gameId, profileId, onBackToLobby }: GameViewProps) {
  const [game, setGame] = useState<Game | null>(null);
  const [playerColor, setPlayerColor] = useState<PieceColor | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [movesData, setMovesData] = useState<Move[]>([]);
  const [currentViewIndex, setCurrentViewIndex] = useState<number>(-1);
  const [showWinnerModal, setShowWinnerModal] = useState<boolean>(false);
  const [showResignModal, setShowResignModal] = useState<boolean>(false);
  const [copied, setCopied] = useState(false);

  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const [isMoving, setIsMoving] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Wall-clock ref: set to Date.now() whenever the active turn (or DB snapshot) changes.
  const timerStartedAt = useRef<number>(Date.now());
  // DB snapshot of each player's remaining time at the moment timerStartedAt was captured.
  const whiteTimeSnapshot = useRef<number>(600);
  const blackTimeSnapshot = useRef<number>(600);
  // Which color was active when the snapshot was taken.
  const activeColorSnapshot = useRef<PieceColor | null>(null);
  // One-shot latch: prevents double-firing endGameOnTimeout when the server
  // already resolved the game via a realtime UPDATE before the local timer fires.
  const timeoutFiredRef = useRef(false);

  useEffect(() => {
    loadGame();
    loadMoves();

    const channel = subscribeToGame(gameId, (updatedGame: Game) => {
      setGame(updatedGame);

      // If the server has already resolved the game (checkmate, resignation, or
      // its own timeout write), reset the latch so future games work correctly.
      if (updatedGame.status !== 'active') {
        timeoutFiredRef.current = false;
      }

      // Grab the server-deducted clock values from the realtime payload.
      const wt = updatedGame.white_time_remaining;
      const bt = updatedGame.black_time_remaining;

      // Update display state
      setWhiteTime(wt);
      setBlackTime(bt);

      // Re-anchor the wall-clock countdown so the local tick loop
      // continues from the correct server-confirmed value.
      whiteTimeSnapshot.current = wt;
      blackTimeSnapshot.current = bt;
      activeColorSnapshot.current = updatedGame.current_turn;
      timerStartedAt.current = Date.now();

      loadMoves();
    });

    // Tick at 100 ms – compute display time via wall-clock diff, not accumulation.
    const timerInterval = setInterval(() => {
      setGame((prevGame) => {
        if (!prevGame || prevGame.status !== 'active') return prevGame;

        const elapsedSec = (Date.now() - timerStartedAt.current) / 1000;

        if (activeColorSnapshot.current === 'white') {
          const newWhiteTime = Math.max(0, whiteTimeSnapshot.current - elapsedSec);
          setWhiteTime(newWhiteTime);
          if (newWhiteTime <= 0 && !timeoutFiredRef.current) {
            timeoutFiredRef.current = true;
            endGameOnTimeout(gameId, 'white');
          }
          return { ...prevGame, white_time_remaining: newWhiteTime };
        } else {
          const newBlackTime = Math.max(0, blackTimeSnapshot.current - elapsedSec);
          setBlackTime(newBlackTime);
          if (newBlackTime <= 0 && !timeoutFiredRef.current) {
            timeoutFiredRef.current = true;
            endGameOnTimeout(gameId, 'black');
          }
          return { ...prevGame, black_time_remaining: newBlackTime };
        }
      });
    }, 100);

    timerIntervalRef.current = timerInterval;

    return () => {
      channel.unsubscribe();
      clearInterval(timerInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const loadGame = async () => {
    const gameData = await getGame(gameId);
    if (gameData) {
      let wt = gameData.white_time_remaining;
      let bt = gameData.black_time_remaining;
      
      // Fallback: if columns were defaulting to 600 but time_format specifies e.g. "1+0" or "3+2"
      if (gameData.time_format && gameData.time_format !== '10+0') {
        const mins = parseInt(gameData.time_format.split('+')[0], 10);
        if (!isNaN(mins) && mins > 0) {
          const parsedSecs = mins * 60;
          if (wt === 600 || wt == null) wt = parsedSecs;
          if (bt === 600 || bt == null) bt = parsedSecs;
        }
      }

      wt = wt ?? 600;
      bt = bt ?? 600;

      const normalizedGame = { ...gameData, white_time_remaining: wt, black_time_remaining: bt };
      setGame(normalizedGame);
      // Re-anchor snapshot so the local timer stays in sync with the DB.
      timerStartedAt.current = Date.now();
      whiteTimeSnapshot.current = wt;
      blackTimeSnapshot.current = bt;
      activeColorSnapshot.current = gameData.current_turn;

      setWhiteTime(wt);
      setBlackTime(bt);

      if (gameData.white_player_id === profileId) {
        setPlayerColor('white');
      } else if (gameData.black_player_id === profileId) {
        setPlayerColor('black');
      }
    }
  };

  const loadMoves = async () => {
    const moves = await getMoves(gameId);
    setMovesData(moves);
    const history = moves.map((m) => {
      const displayNotation = (m.notation && m.notation !== 'null-null') ? m.notation : '...';
      return `${m.move_number}. ${displayNotation}${m.is_check && !displayNotation.includes('+') && !displayNotation.includes('#') ? '+' : ''}${m.is_checkmate && !displayNotation.includes('#') ? '#' : ''}`;
    });
    setMoveHistory(history);
  };

  useEffect(() => {
    if (game?.status === 'finished') {
      setShowWinnerModal(true);
    }
  }, [game?.status]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (game?.status !== 'finished' || movesData.length === 0) return;

      if (e.key === 'ArrowLeft') {
        setCurrentViewIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentViewIndex(prev => Math.min(movesData.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [game?.status, movesData.length]);

  const currentBoard = useMemo(() => {
    if (currentViewIndex === -1 || movesData.length === 0) return game?.board_state;

    let board = createInitialBoard();
    // Replay moves up to currentViewIndex with defensive programming
    for (let i = 0; i <= currentViewIndex; i++) {
      const m = movesData[i];
      
      const moveNotation = m?.notation || '...';
      const notationParts = moveNotation !== '...' ? moveNotation.split('-') : [];

      if (notationParts.length !== 2) {
        console.warn('Skipping corrupted move data at index', i, m);
        continue;
      }

      try {
        const from = algebraicToPosition(notationParts[0]);
        const to = algebraicToPosition(notationParts[1]);
        const res = makeMove(board, from, to);
        board = res.newBoard;
      } catch (err) {
        console.warn('Failed to replay move at index', i, m, err);
      }
    }
    return board;
  }, [game?.board_state, movesData, currentViewIndex]);

  // Compute algebraic square highlights of the active/viewed move
  const lastMovePositions = useMemo(() => {
    if (movesData.length === 0) return { from: null, to: null };

    const activeMoveIndex = currentViewIndex === -1 ? movesData.length - 1 : currentViewIndex;
    const activeMove = movesData[activeMoveIndex];
    if (!activeMove || !activeMove.notation || activeMove.notation === '...') {
      return { from: null, to: null };
    }

    const parts = activeMove.notation.split('-');
    if (parts.length !== 2) return { from: null, to: null };

    try {
      return {
        from: algebraicToPosition(parts[0]),
        to: algebraicToPosition(parts[1])
      };
    } catch {
      return { from: null, to: null };
    }
  }, [movesData, currentViewIndex]);

  const handleMove = async (from: Position, to: Position) => {
    if (!game || isMoving) return;
    setIsMoving(true);

    try {
      const updatedGame = await makeGameMove(gameId, profileId, from, to, game);

      // Optimistically apply the returned game JSON block immediately
      setGame((prev) =>
        prev
          ? { ...prev, ...updatedGame }
          : prev
      );
    } catch (error) {
      console.error('Error making move:', error);
    } finally {
      setIsMoving(false);
    }
  };

  const handleResign = async () => {
    setShowResignModal(false);
    if (!playerColor) return;
    const opponentColor = playerColor === 'white' ? 'black' : 'white';
    try {
      await endGame(gameId, opponentColor);
    } catch (err) {
      console.error('Resignation write failed:', err);
    }
  };

  const handleTimeUp = async (lostColor: PieceColor) => {
    if (!game || game.status !== 'active') return;
    if (timeoutFiredRef.current) return;
    timeoutFiredRef.current = true;
    await endGameOnTimeout(gameId, lostColor);
  };

  const copyGameLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine game over reason
  const winReason = useMemo(() => {
    if (!game || game.status !== 'finished') return '';
    if (game.winner === 'draw') return 'Stalemate';

    const isTimeout = game.white_time_remaining <= 0 || game.black_time_remaining <= 0;
    if (isTimeout) return 'Timeout';

    const lastMove = movesData[movesData.length - 1];
    if (lastMove && lastMove.is_checkmate) return 'Checkmate';

    return 'Resignation';
  }, [game, movesData]);

  // ⚠️ IMPORTANT: This useEffect MUST be declared before any conditional returns
  // to comply with React's Rules of Hooks (prevents error #310).
  useEffect(() => {
    if (game?.status !== 'active') return;
    if (whiteTime <= 0 && game.current_turn === 'white') {
      handleTimeUp('white');
    }
    if (blackTime <= 0 && game.current_turn === 'black') {
      handleTimeUp('black');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whiteTime, blackTime, game?.status, game?.current_turn]);

  if (!game) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading game...</div>
      </div>
    );
  }

  const isWaiting = game.status === 'waiting';

  const formatTime = (timeInSecs: number) => {
    const mins = Math.floor(timeInSecs / 60);
    const secs = Math.floor(timeInSecs % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const amIWhite = playerColor === 'white' || playerColor === null;
  const myUsername = amIWhite ? game.white_player_username : game.black_player_username;
  const opponentUsername = amIWhite ? game.black_player_username : game.white_player_username;
  const myTime = amIWhite ? whiteTime : blackTime;
  const opponentTime = amIWhite ? blackTime : whiteTime;
  const myColor = amIWhite ? 'white' : 'black';
  const opponentColor = amIWhite ? 'black' : 'white';
  const isMyTurn = game.current_turn === myColor;
  const isOpponentTurn = game.current_turn === opponentColor;
  const myTimeCritical = myTime < 10;
  const opponentTimeCritical = opponentTime < 10;

  return (
    <div className="w-screen min-h-screen bg-slate-950 flex flex-col lg:flex-row items-center justify-center pt-16 pb-6 px-4 gap-4 lg:gap-8 relative overflow-y-auto custom-scrollbar">
      
      {/* Top Bar */}
      <div className="w-full flex items-center justify-between text-slate-300 absolute top-0 left-0 p-4 z-10 pointer-events-auto">
          <button onClick={onBackToLobby} className="flex items-center gap-2 hover:text-white transition-colors font-semibold bg-slate-900/60 p-2 rounded-lg backdrop-blur shadow-lg shadow-black/20 border border-slate-800">
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Back to Lobby</span>
          </button>

          {!isWaiting && game.status === 'active' && playerColor && (
            <button
              onClick={() => setShowResignModal(true)}
              className="text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:border-rose-500/50 px-4 py-2 rounded-lg font-semibold shrink-0 transition-colors shadow-lg shadow-rose-950/20"
            >
              Resign
            </button>
          )}
          
          {isWaiting && (
             <button onClick={copyGameLink} className="flex items-center gap-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-400 px-4 py-2 rounded-lg transition-colors font-semibold backdrop-blur shadow-[0_0_12px_rgba(6,182,212,0.15)]">
               {copied ? (
                 <>
                   <Check className="w-5 h-5" />
                   Copied!
                 </>
               ) : (
                 <>
                   <Copy className="w-5 h-5" />
                   Share Link
                 </>
               )}
             </button>
          )}
      </div>

      {/* LEFT SIDE: Board */}
      <div className="flex flex-col items-center justify-center w-full max-w-full lg:w-auto h-auto relative shrink-0">
        
        {/* Opponent Info */}
        <div
          className="flex justify-between items-center text-slate-300 py-1.5 px-1"
          style={{ width: 'min(65vmin, calc(100vh - 220px), 520px)' }}
        >
          <span className="font-medium text-sm flex items-center gap-2">
            {opponentUsername}
            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 uppercase tracking-wider">Opponent</span>
          </span>
          <span className={`font-mono px-2 py-0.5 rounded border transition-colors ${
              isOpponentTurn ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.3)]' : 'bg-slate-900 border-slate-800 text-slate-500'
            } ${opponentTimeCritical ? 'animate-pulse text-red-400 border-red-500/50 bg-red-900/30' : ''}`}>
            {formatTime(opponentTime)}
          </span>
        </div>

        {/* Board Frame — fills to min(65vmin, calc(100vh - 220px), 520px) */}
        <div
          className="bg-slate-900 border-2 border-slate-800 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] overflow-hidden relative"
          style={{ 
            width: 'min(65vmin, calc(100vh - 220px), 520px)', 
            height: 'min(65vmin, calc(100vh - 220px), 520px)' 
          }}
        >
          <ChessBoard
            board={currentBoard || game.board_state}
            currentTurn={game.current_turn}
            playerColor={playerColor}
            onMove={handleMove}
            isActive={game.status === 'active' && currentViewIndex === -1}
            lastMoveFrom={lastMovePositions.from}
            lastMoveTo={lastMovePositions.to}
          />
          
          {isWaiting && (
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center z-10 text-center p-4">
              <div className="bg-cyan-950/50 border border-cyan-500/30 text-cyan-300 px-6 py-4 rounded-xl backdrop-blur-md shadow-[0_0_20px_rgba(6,182,212,0.1)]">
                <p className="font-bold text-lg mb-1 tracking-wide">Waiting for opponent</p>
                <p className="text-sm opacity-80 font-mono">Share the link to invite someone</p>
              </div>
            </div>
          )}
        </div>

        {/* My Info */}
        <div
          className="flex justify-between items-center text-slate-300 py-1.5 px-1"
          style={{ width: 'min(65vmin, calc(100vh - 220px), 520px)' }}
        >
          <span className="font-medium text-sm flex items-center gap-2">
            {myUsername}
            <span className="text-[10px] bg-cyan-900/40 text-cyan-400 border border-cyan-800/50 px-1.5 py-0.5 rounded uppercase tracking-wider">You</span>
          </span>
          <span className={`font-mono px-2 py-0.5 rounded border transition-colors ${
              isMyTurn ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.3)]' : 'bg-slate-900 border-slate-800 text-slate-500'
            } ${myTimeCritical ? 'animate-pulse text-red-400 border-red-500/50 bg-red-900/30' : ''}`}>
            {formatTime(myTime)}
          </span>
        </div>
      </div>

      {/* RIGHT SIDE: Sidebar widgets */}
      <div
        className="w-full max-w-full lg:w-[320px] xl:w-[360px] h-[260px] lg:h-[min(65vmin,calc(100vh-220px),520px)] flex flex-col gap-4"
      >
        
        <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col overflow-hidden shadow-2xl">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">Move Log</span>
            <span className={`text-[10px] font-mono px-2 py-1 rounded border ${
              game.status === 'active' ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}>
              {game.status === 'active' ? 'IN PROGRESS' : game.status.toUpperCase()}
            </span>
          </div>

          {game.status === 'finished' && (
            <div className="bg-cyan-950/30 text-cyan-300 border border-cyan-800/50 p-3 rounded-lg text-center mb-3 text-xs shadow-inner">
              <p className="font-bold mb-1 tracking-wide">Analysis Mode</p>
              <p className="opacity-80">Use <kbd className="bg-slate-800 px-1 py-0.5 rounded text-white border border-slate-600 shadow">←</kbd> <kbd className="bg-slate-800 px-1 py-0.5 rounded text-white border border-slate-600 shadow">→</kbd> to navigate</p>
              {currentViewIndex !== -1 && (
                <p className="text-cyan-400 mt-2 font-mono">Move {currentViewIndex + 1}/{movesData.length}</p>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {moveHistory.length === 0 ? (
              <p className="text-slate-600 text-xs font-mono text-center pt-8">No moves yet</p>
            ) : (
              moveHistory.map((move, idx) => {
                const isHighlighted = currentViewIndex === -1 
                  ? idx === moveHistory.length - 1 
                  : idx === currentViewIndex;
                return (
                  <div 
                    key={idx} 
                    className={`text-xs font-mono px-3 py-2 rounded transition-colors cursor-default ${
                      isHighlighted 
                        ? 'bg-cyan-900/40 border border-cyan-800/60 text-cyan-300 font-bold shadow-[0_0_8px_rgba(6,182,212,0.1)]' 
                        : 'bg-slate-950/50 text-slate-400 hover:bg-slate-900/80'
                    }`}
                  >
                    {move}
                  </div>
                );
              })
            )}
          </div>
        </div>
        
        {/* Game Chat Panel Placeholder */}
        <div className="h-[120px] bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 shadow-2xl relative overflow-hidden group shrink-0">
          <div className="absolute inset-0 bg-gradient-to-t from-cyan-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <p className="text-xs font-mono text-slate-500 uppercase tracking-widest text-center">
            Game Chat
          </p>
          <span className="text-[10px] text-cyan-600/50 font-mono bg-cyan-950/30 px-2 py-0.5 rounded border border-cyan-900/30">
            Coming Soon
          </span>
        </div>
      </div>

      {/* Resignation Confirmation Modal */}
      {showResignModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.8)] p-6 max-w-sm w-full text-center border border-slate-800 relative overflow-hidden">
            <h3 className="text-xl font-bold text-white mb-2">Resign Match?</h3>
            <p className="text-slate-400 text-sm mb-6">Your opponent will be declared the winner.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResignModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-xl border border-slate-700 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleResign}
                className="flex-1 bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 text-red-400 font-bold py-2.5 rounded-xl transition-all text-sm shadow-[0_0_15px_rgba(239,68,68,0.15)]"
              >
                Resign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Winner Modal */}
      {showWinnerModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowWinnerModal(false)}>
          <div 
            className="bg-slate-900 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.8)] p-8 max-w-sm w-full text-center border border-slate-800 transform transition-all relative overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-60"></div>
            
            <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Game Over</h2>
            <div className="text-lg text-cyan-400 mb-8 font-mono font-medium tracking-wide">
              {game.winner === 'draw' 
                ? "It's a Draw! (Stalemate)" 
                : `${game.winner === 'white' ? game.white_player_username : game.black_player_username} wins by ${winReason}!`}
            </div>
            
            <button
              onClick={() => setShowWinnerModal(false)}
              className="bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/50 text-cyan-400 font-bold font-mono tracking-widest uppercase py-3 px-6 rounded-xl transition-all w-full shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:shadow-[0_0_20px_rgba(6,182,212,0.25)]"
            >
              Analyze Game
            </button>
            <button
              onClick={onBackToLobby}
              className="mt-3 bg-slate-800/50 hover:bg-slate-800 text-slate-400 font-mono font-bold tracking-widest uppercase text-xs py-3 px-6 rounded-xl transition-colors w-full border border-slate-700 hover:border-slate-600"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
