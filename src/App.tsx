import { useState, useEffect } from 'react';
import { Player } from './types/chess';
import { createOrGetPlayer, updatePlayerStatus } from './lib/gameService';
import { supabase } from './lib/supabase';
import GameLobby from './components/GameLobby';
import GameView from './components/GameView';
import AuthView from './components/AuthView';
import ProfileView from './components/ProfileView';
import SocialSidebar from './components/SocialSidebar';

// ─── App-level view type ──────────────────────────────────────────────────────
type AppView =
  | { screen: 'auth' }
  | { screen: 'lobby' }
  | { screen: 'game'; gameId: string }
  | { screen: 'profile'; username: string }
  | { screen: 'loading' };

// ─── URL → initial view ───────────────────────────────────────────────────────
function resolveInitialView(): AppView {
  const path = window.location.pathname;
  if (path.startsWith('/game/')) {
    const id = path.split('/')[2];
    if (id) return { screen: 'game', gameId: id };
  }
  if (path.startsWith('/profile/')) {
    const username = path.split('/')[2];
    if (username) return { screen: 'profile', username: decodeURIComponent(username) };
  }
  return { screen: 'loading' };
}

// ─── Component ────────────────────────────────────────────────────────────────
function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [view, setView] = useState<AppView>(resolveInitialView);
  const [bootstrapping, setBootstrapping] = useState(true);

  // ── 1. Session bootstrap ───────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await hydratePlayer(session.user.id);
      }
      setBootstrapping(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          await hydratePlayer(session.user.id);
        } else {
          setPlayer(null);
          navigate('/', { screen: 'auth' });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── 2. After bootstrap: resolve the correct screen ────────────────────────
  useEffect(() => {
    if (bootstrapping) return;
    // If no auth, always show auth regardless of URL intent
    if (!player) {
      setView({ screen: 'auth' });
      return;
    }
    // After login, honour any URL-derived deep-link that was resolved on mount
    setView(prev => {
      if (prev.screen === 'loading' || prev.screen === 'auth') {
        return { screen: 'lobby' };
      }
      return prev; // preserve /game/:id or /profile/:username deep-links
    });
  }, [bootstrapping, player]);

  // ── 3. Player hydration ───────────────────────────────────────────────────
  const hydratePlayer = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', userId)
        .single();

      if (!profile?.username) return;
      setProfileId(profile.id);
      const playerData = await createOrGetPlayer(profile.username);
      setPlayer(playerData);
    } catch (err) {
      console.error('Failed to hydrate player profile:', err);
    }
  };

  // ── 4. Navigation helpers ─────────────────────────────────────────────────
  function navigate(url: string, nextView: AppView) {
    window.history.pushState({}, '', url);
    setView(nextView);
  }

  const handleAuthSuccess = async (_userId: string, username: string) => {
    try {
      const playerData = await createOrGetPlayer(username);
      setPlayer(playerData);
      navigate('/', { screen: 'lobby' });
    } catch (err) {
      console.error('Error creating player record:', err);
    }
  };

  const handleGameStart = (gameId: string) => {
    navigate(`/game/${gameId}`, { screen: 'game', gameId });
  };

  const handleBackToLobby = async () => {
    if (player) await updatePlayerStatus(player.id, 'online');
    navigate('/', { screen: 'lobby' });
  };

  const handleViewProfile = (username: string) => {
    navigate(`/profile/${encodeURIComponent(username)}`, { screen: 'profile', username });
  };

  // "Analyze Game" from ProfileView → route into GameView (finished game = analysis mode)
  const handleAnalyzeGame = (gameId: string) => {
    navigate(`/game/${gameId}`, { screen: 'game', gameId });
  };

  // ── 5. Render ─────────────────────────────────────────────────────────────
  if (bootstrapping || view.screen === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950 to-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!player || view.screen === 'auth') {
    return <AuthView onAuthSuccess={handleAuthSuccess} />;
  }

  if (view.screen === 'game') {
    return (
      <GameView
        gameId={view.gameId}
        player={player}
        onBackToLobby={handleBackToLobby}
      />
    );
  }

  if (view.screen === 'profile') {
    return (
      <ProfileView
        targetUsername={view.username}
        currentPlayer={player}
        onBackToLobby={handleBackToLobby}
        onAnalyzeGame={handleAnalyzeGame}
      />
    );
  }

  // Default: lobby  — wrap in flex row so sidebar sits next to content
  return (
    <div className="flex min-h-screen">
      <div className="flex-1 overflow-hidden">
        <GameLobby
          player={player}
          onGameStart={handleGameStart}
          onViewProfile={handleViewProfile}
        />
      </div>
      {profileId && (
        <SocialSidebar
          currentProfileId={profileId}
          currentUsername={player.username}
        />
      )}
    </div>
  );
}

export default App;