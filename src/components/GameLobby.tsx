import { useState, useEffect } from 'react';
import { Game, Player } from '../types/chess';
import { createGame, getAvailableGames, joinGame } from '../lib/gameService';
import { supabase } from '../lib/supabase';
import { Users, Plus, Play } from 'lucide-react';

interface GameLobbyProps {
  player: Player;
  onGameStart: (gameId: string) => void;
}

export default function GameLobby({ player, onGameStart }: GameLobbyProps) {
  const [availableGames, setAvailableGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAvailableGames();

    const channel = supabase
      .channel('games-lobby')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: 'status=eq.waiting'
        },
        () => {
          loadAvailableGames();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadAvailableGames = async () => {
    const games = await getAvailableGames();
    setAvailableGames(games.filter(g => g.white_player_id !== player.id));
  };

  const handleCreateGame = async () => {
    setLoading(true);
    try {
      const game = await createGame(player.id);
      onGameStart(game.id);
    } catch (error) {
      console.error('Error creating game:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async (gameId: string) => {
    setLoading(true);
    try {
      await joinGame(gameId, player.id);
      onGameStart(gameId);
    } catch (error) {
      console.error('Error joining game:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Users className="w-12 h-12" />
            Chess Multiplayer
          </h1>
          <p className="text-slate-300 text-lg">Welcome, {player.username}!</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="mb-8">
            <button
              onClick={handleCreateGame}
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg shadow-lg hover:shadow-xl"
            >
              <Plus className="w-6 h-6" />
              Create New Game
            </button>
          </div>

          <div className="border-t border-slate-200 pt-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Play className="w-6 h-6" />
              Available Games
            </h2>

            {availableGames.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">No games available at the moment.</p>
                <p className="text-sm mt-2">Create a new game to get started!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableGames.map((game) => (
                  <div
                    key={game.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors border border-slate-200"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">Game {game.id.slice(0, 8)}...</p>
                      <p className="text-sm text-slate-500">Waiting for opponent</p>
                    </div>
                    <button
                      onClick={() => handleJoinGame(game.id)}
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                    >
                      Join Game
                    </button>
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
