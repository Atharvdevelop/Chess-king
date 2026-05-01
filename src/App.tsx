import { useState, useEffect } from 'react';
import { Player } from './types/chess';
import { createOrGetPlayer, updatePlayerStatus } from './lib/gameService';// Updated to plural
import GameLobby from './components/GameLobby';
import GameView from './components/GameView';
import { Crown } from 'lucide-react';

function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [username, setUsername] = useState('');
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 1. URL & LOGIN DETECTOR
  useEffect(() => {
    // Check if we are landing on a specific game URL (e.g., /game/uuid)
    const path = window.location.pathname;
    if (path.startsWith('/game/')) {
      const idFromUrl = path.split('/')[2];
      if (idFromUrl) setCurrentGameId(idFromUrl);
    }

    const savedUsername = localStorage.getItem('chess_username');
    if (savedUsername) {
      handleLogin(savedUsername);
    }
  }, []);

  const handleLogin = async (name: string) => {
    setLoading(true);
    try {
      const playerData = await createOrGetPlayer(name);
      setPlayer(playerData);
      localStorage.setItem('chess_username', name);
    } catch (error) {
      console.error('Error creating player:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      handleLogin(username.trim());
    }
  };

  const handleGameStart = (gameId: string) => {
    // Update URL without reloading, then set state
    window.history.pushState({}, '', `/game/${gameId}`);
    setCurrentGameId(gameId);
  };

  const handleBackToLobby = async () => {
    if (player) {
      // Set status back to 'online' so you show up in the lobby again
      await updatePlayerStatus(player.id, 'online');
    }
    // Clear URL and state
    window.history.pushState({}, '', '/');
    setCurrentGameId(null);
  };

  if (!player) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-white">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Crown className="w-16 h-16 text-yellow-400" />
            </div>
            <h1 className="text-5xl font-bold mb-2">Chess Online</h1>
            <p className="text-slate-300">Play chess with anyone, anywhere</p>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <form onSubmit={handleSubmit}>
              <label className="block text-slate-700 text-sm font-semibold mb-2">
                Choose your username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 text-slate-900 transition-colors mb-4"
                disabled={loading}
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || !username.trim()}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {loading ? 'Connecting...' : 'Start Playing'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // RENDER LOGIC
  if (currentGameId) {
    return <GameView gameId={currentGameId} player={player} onBackToLobby={handleBackToLobby} />;
  }

  return <GameLobby player={player} onGameStart={handleGameStart} />;
}

export default App;