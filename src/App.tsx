import { useState, useEffect } from 'react';
import { Player } from './types/chess';
import { createOrGetPlayer, updatePlayerStatus } from './lib/gameService';
import { supabase } from './lib/supabase';
import GameLobby from './components/GameLobby';
import GameView from './components/GameView';
import AuthView from './components/AuthView';

function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  // ── 1. On mount: check for existing Supabase session + URL game ID ──────────
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/game/')) {
      const idFromUrl = path.split('/')[2];
      if (idFromUrl) setCurrentGameId(idFromUrl);
    }

    // Check if there's already a valid Supabase session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await hydratePlayer(session.user.id);
      }
      setBootstrapping(false);
    });

    // Listen for future auth state changes (e.g. redirect after email confirm)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          await hydratePlayer(session.user.id);
        } else {
          setPlayer(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── 2. Load player profile from DB after auth ─────────────────────────────
  const hydratePlayer = async (userId: string) => {
    try {
      // Try the profiles table first (new accounts)
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single();

      const username = profile?.username;
      if (!username) return;

      // Upsert into players (used by the existing game engine)
      const playerData = await createOrGetPlayer(username);
      setPlayer(playerData);
    } catch (err) {
      console.error('Failed to hydrate player profile:', err);
    }
  };

  // ── 3. Called by AuthView on successful sign-in / registration ─────────────
  const handleAuthSuccess = async (userId: string, username: string) => {
    try {
      const playerData = await createOrGetPlayer(username);
      setPlayer(playerData);
    } catch (err) {
      console.error('Error creating player record:', err);
    }
  };

  // ── 4. Game lifecycle handlers ─────────────────────────────────────────────
  const handleGameStart = (gameId: string) => {
    window.history.pushState({}, '', `/game/${gameId}`);
    setCurrentGameId(gameId);
  };

  const handleBackToLobby = async () => {
    if (player) {
      await updatePlayerStatus(player.id, 'online');
    }
    window.history.pushState({}, '', '/');
    setCurrentGameId(null);
  };

  // ── 5. Render ──────────────────────────────────────────────────────────────
  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950 to-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!player) {
    return <AuthView onAuthSuccess={handleAuthSuccess} />;
  }

  if (currentGameId) {
    return <GameView gameId={currentGameId} player={player} onBackToLobby={handleBackToLobby} />;
  }

  return <GameLobby player={player} onGameStart={handleGameStart} />;
}

export default App;