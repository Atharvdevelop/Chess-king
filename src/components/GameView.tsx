import { useEffect, useState, useRef } from 'react';
import { Game, Player, PieceColor, Position } from '../types/chess';
import { getGame, makeGameMove, subscribeToGame, getMoves, endGameOnTimeout } from '../lib/gameService';
import ChessBoard from './ChessBoard';
import Timer from './Timer';
import { ArrowLeft, Copy, Check } from 'lucide-react';

interface GameViewProps {
  gameId: string;
  player: Player;
  onBackToLobby: () => void;
}

export default function GameView({ gameId, player, onBackToLobby }: GameViewProps) {
  const [game, setGame] = useState<Game | null>(null);
  const [playerColor, setPlayerColor] = useState<PieceColor | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const [isMoving, setIsMoving] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Wall-clock ref: set to Date.now() whenever the active turn (or DB snapshot) changes.
  const timerStartedAt = useRef<number>(Date.now());
  // DB snapshot of each player's remaining time at the moment timerStartedAt was captured.
  const whiteTimeSnapshot = useRef<number>(600);
  const blackTimeSnapshot = useRef<number>(600);
  // Which color was active when the snapshot was taken.
  const activeColorSnapshot = useRef<PieceColor | null>(null);

  // Reset the wall-clock snapshot whenever we receive a fresh DB state.
  const resetTimerSnapshot = (g: Game) => {
    timerStartedAt.current = Date.now();
    whiteTimeSnapshot.current = g.white_time_remaining;
    blackTimeSnapshot.current = g.black_time_remaining;
    activeColorSnapshot.current = g.current_turn;
  };

  useEffect(() => {
    loadGame();
    loadMoves();

    const channel = subscribeToGame(gameId, (updatedGame) => {
      setGame(updatedGame);
      // Re-anchor the wall-clock snapshot to the freshly received DB values.
      resetTimerSnapshot(updatedGame);
      setWhiteTime(updatedGame.white_time_remaining);
      setBlackTime(updatedGame.black_time_remaining);
      loadMoves();
    });

    const refreshInterval = setInterval(() => {
      loadGame();
    }, 5000);

    // Tick at 100 ms – compute display time via wall-clock diff, not accumulation.
    const timerInterval = setInterval(() => {
      setGame((prevGame) => {
        if (!prevGame || prevGame.status !== 'active') return prevGame;

        const elapsedSec = (Date.now() - timerStartedAt.current) / 1000;

        if (activeColorSnapshot.current === 'white') {
          const newWhiteTime = Math.max(0, whiteTimeSnapshot.current - elapsedSec);
          setWhiteTime(newWhiteTime);
          // Keep the game object's field in sync for timeout detection downstream.
          return { ...prevGame, white_time_remaining: newWhiteTime };
        } else {
          const newBlackTime = Math.max(0, blackTimeSnapshot.current - elapsedSec);
          setBlackTime(newBlackTime);
          return { ...prevGame, black_time_remaining: newBlackTime };
        }
      });
    }, 100);

    refreshIntervalRef.current = refreshInterval;
    timerIntervalRef.current = timerInterval;

    return () => {
      channel.unsubscribe();
      clearInterval(refreshInterval);
      clearInterval(timerInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const loadGame = async () => {
    const gameData = await getGame(gameId);
    if (gameData) {
      setGame(gameData);
      // Re-anchor snapshot so the local timer stays in sync with the DB.
      resetTimerSnapshot(gameData);
      setWhiteTime(gameData.white_time_remaining);
      setBlackTime(gameData.black_time_remaining);

      if (gameData.white_player_id === player.id) {
        setPlayerColor('white');
      } else if (gameData.black_player_id === player.id) {
        setPlayerColor('black');
      }
    }
  };

  const loadMoves = async () => {
    const moves = await getMoves(gameId);
    const history = moves.map((m) =>
      `${m.move_number}. ${m.from_position}-${m.to_position}${m.is_check ? '+' : ''}`
    );
    setMoveHistory(history);
  };

  const handleMove = async (from: Position, to: Position) => {
    if (!game || isMoving) return;
    setIsMoving(true);

    try {
      const newBoard = await makeGameMove(gameId, player.id, from, to, game);

      // Optimistically apply the new board immediately so the piece stays on
      // its destination square before the realtime subscription delivers the
      // authoritative DB snapshot (which will be identical).
      const nextTurn = game.current_turn === 'white' ? 'black' : 'white';
      setGame((prev) =>
        prev
          ? { ...prev, board_state: newBoard, current_turn: nextTurn }
          : prev
      );
    } catch (error) {
      console.error('Error making move:', error);
    } finally {
      setIsMoving(false);
    }
  };

  const handleTimeUp = async (lostColor: PieceColor) => {
    if (!game || game.status !== 'active') return;
    await endGameOnTimeout(gameId, lostColor);
  };

  const copyGameLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!game) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading game...</div>
      </div>
    );
  }

  const isWaiting = game.status === 'waiting';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={onBackToLobby}
            className="flex items-center gap-2 text-white hover:text-slate-300 transition-colors font-semibold"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Lobby
          </button>

          {isWaiting && (
            <button
              onClick={copyGameLink}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-semibold"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  Share Game Link
                </>
              )}
            </button>
          )}
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            {!isWaiting && game.status === 'active' && (
              <div className="mb-6 grid grid-cols-2 gap-4">
                <Timer
                  timeRemaining={blackTime}
                  isActive={game.current_turn === 'black'}
                  color="black"
                  playerUsername={game.black_player_username}
                  onTimeUp={() => handleTimeUp('black')}
                />
                <Timer
                  timeRemaining={whiteTime}
                  isActive={game.current_turn === 'white'}
                  color="white"
                  playerUsername={game.white_player_username}
                  onTimeUp={() => handleTimeUp('white')}
                />
              </div>
            )}

            <ChessBoard
              board={game.board_state}
              currentTurn={game.current_turn}
              playerColor={playerColor}
              onMove={handleMove}
              isActive={game.status === 'active'}
            />

            {isWaiting && (
              <div className="mt-6 text-center">
                <div className="inline-block bg-yellow-100 border-2 border-yellow-400 text-yellow-800 px-6 py-3 rounded-lg">
                  <p className="font-semibold">Waiting for opponent to join...</p>
                  <p className="text-sm mt-1">Share the game link to invite someone!</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-6 h-fit sticky top-8">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Game Info</h3>

            {game.status === 'active' && (
              <div className="mb-4 pb-4 border-b border-slate-200">
                <p className="text-sm font-semibold text-slate-600 mb-2">Players</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{game.white_player_username}</span>
                    <span className={`text-xs px-2 py-1 rounded ${playerColor === 'white' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                      {playerColor === 'white' ? 'You' : 'Opponent'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{game.black_player_username}</span>
                    <span className={`text-xs px-2 py-1 rounded ${playerColor === 'black' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                      {playerColor === 'black' ? 'You' : 'Opponent'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="text-sm font-semibold text-slate-600 mb-2">Move History</p>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {moveHistory.length === 0 ? (
                  <p className="text-slate-500 text-sm">No moves yet</p>
                ) : (
                  moveHistory.map((move, idx) => (
                    <div key={idx} className="text-sm font-mono bg-slate-50 px-3 py-2 rounded">
                      {move}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-600 mb-2">Status</p>
              <p className="text-sm font-semibold text-slate-700 capitalize">
                {game.status === 'active' ? 'In Progress' : 'Waiting'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
