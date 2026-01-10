import { useEffect, useState } from 'react';
import { Game, Player, PieceColor, Position } from '../types/chess';
import { getGame, makeGameMove, subscribeToGame, getMoves } from '../lib/gameService';
import ChessBoard from './ChessBoard';
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

  useEffect(() => {
    loadGame();
    loadMoves();

    const channel = subscribeToGame(gameId, (updatedGame) => {
      setGame(updatedGame);
      loadMoves();
    });

    return () => {
      channel.unsubscribe();
    };
  }, [gameId]);

  const loadGame = async () => {
    const gameData = await getGame(gameId);
    if (gameData) {
      setGame(gameData);
      if (gameData.white_player_id === player.id) {
        setPlayerColor('white');
      } else if (gameData.black_player_id === player.id) {
        setPlayerColor('black');
      }
    }
  };

  const loadMoves = async () => {
    const moves = await getMoves(gameId);
    const history = moves.map(m =>
      `${m.move_number}. ${m.from_position}-${m.to_position}${m.is_check ? '+' : ''}`
    );
    setMoveHistory(history);
  };

  const handleMove = async (from: Position, to: Position) => {
    if (!game) return;

    try {
      await makeGameMove(gameId, from, to, game);
    } catch (error) {
      console.error('Error making move:', error);
    }
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
            className="flex items-center gap-2 text-white hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Lobby
          </button>

          {isWaiting && (
            <button
              onClick={copyGameLink}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
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

        <div className="grid lg:grid-cols-[1fr_auto] gap-8 items-start">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
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

          <div className="bg-white rounded-2xl shadow-2xl p-6 lg:w-80">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Move History</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {moveHistory.length === 0 ? (
                <p className="text-slate-500 text-sm">No moves yet</p>
              ) : (
                moveHistory.map((move, idx) => (
                  <div
                    key={idx}
                    className="text-sm font-mono bg-slate-50 px-3 py-2 rounded"
                  >
                    {move}
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200">
              <h4 className="font-semibold text-slate-800 mb-2">Game Info</h4>
              <div className="text-sm space-y-1 text-slate-600">
                <p>Game ID: <span className="font-mono text-xs">{gameId.slice(0, 12)}...</span></p>
                <p>Status: <span className="font-semibold">{game.status}</span></p>
                {playerColor && (
                  <p>Your Color: <span className="font-semibold capitalize">{playerColor}</span></p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
