import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { Player } from './types/chess';
import { createOrGetPlayer, updatePlayerStatus } from './lib/gameService';
import { supabase } from './lib/supabase';
import GameLobby from './components/GameLobby';
import GameView from './components/GameView';
import AuthView from './components/AuthView';
import ProfileView from './components/ProfileView';
import SocialSidebar from './components/SocialSidebar';
import ChallengeView from './components/ChallengeView';
import AdminPanel from './components/AdminPanel';

// ─── App-level view type ──────────────────────────────────────────────────────
type AppView =
  | { screen: 'auth' }
  | { screen: 'lobby' }
  | { screen: 'game'; gameId: string }
  | { screen: 'profile'; username: string }
  | { screen: 'challenge'; mode?: 'open' | 'direct'; targetUser?: string }
  | { screen: 'admin' }
  | { screen: 'loading' };

// ─── URL → initial view ───────────────────────────────────────────────────────
function resolveInitialView(hasPlayer: boolean = false): AppView {
  const path = window.location.pathname;
  if (path.startsWith('/game/')) {
    const id = path.split('/')[2];
    if (id) return { screen: 'game', gameId: id };
  }
  if (path.startsWith('/profile/')) {
    const username = path.split('/')[2];
    if (username) return { screen: 'profile', username: decodeURIComponent(username) };
  }
  if (path === '/challenge') {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') as 'open' | 'direct' | undefined;
    const targetUser = params.get('u') || undefined;
    return { screen: 'challenge', mode, targetUser };
  }
  if (path === '/admin') return { screen: 'admin' };
  return hasPlayer ? { screen: 'lobby' } : { screen: 'loading' };
}

// ─── Component ────────────────────────────────────────────────────────────────
function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [view, setView] = useState<AppView>(() => resolveInitialView(false));
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // ── 0. Listen for back/forward browser history actions ─────────────────────
  useEffect(() => {
    const handlePopState = () => {
      setView(resolveInitialView(!!player));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [player]);

  // ── 1. Session bootstrap ───────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setBootstrapping(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── 2. Profile fetching sequence ───────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (!session?.user?.id) {
        if (isMounted) {
          setPlayer(null);
          setProfileId(null);
        }
        return;
      }

      if (isMounted) setLoadingProfile(true);
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('id', session.user.id)
          .single();

        if (profile?.username && isMounted) {
          setProfileId(profile.id);
          const playerData = await createOrGetPlayer(session.user.id, profile.username);
          if (isMounted) {
            setPlayer(playerData);
          }
        }
      } catch (err) {
        console.error('Failed to hydrate player profile:', err);
      } finally {
        if (isMounted) {
          setLoadingProfile(false);
        }
      }
    };

    if (!bootstrapping) {
      loadProfile();
    }

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, bootstrapping]);

  // ── 3. Screen resolution ──────────────────────────────────────────────────
  useEffect(() => {
    if (bootstrapping || loadingProfile) return;
    
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
      return prev; // preserve deep-links
    });
  }, [bootstrapping, loadingProfile, player]);

  // ── 4. Navigation helpers ─────────────────────────────────────────────────
  function navigate(url: string, nextView: AppView) {
    window.history.pushState({}, '', url);
    setView(nextView);
  }

  const handleAuthSuccess = async (_userId: string, username: string) => {
    try {
      const playerData = await createOrGetPlayer(_userId, username);
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

  const handleCreateChallenge = (mode?: 'open' | 'direct', targetUser?: string) => {
    let url = '/challenge';
    const params = new URLSearchParams();
    if (mode) params.set('mode', mode);
    if (targetUser) params.set('u', targetUser);
    const queryStr = params.toString();
    if (queryStr) url += `?${queryStr}`;
    
    navigate(url, { screen: 'challenge', mode, targetUser });
  };

  const handleAnalyzeGame = (gameId: string) => {
    navigate(`/game/${gameId}`, { screen: 'game', gameId });
  };

  const handleOpenAdmin = () => {
    navigate('/admin', { screen: 'admin' });
  };

  // ── 5. Render ─────────────────────────────────────────────────────────────
  if (bootstrapping || loadingProfile || view.screen === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-cyan-400 rounded-full animate-spin shadow-[0_0_15px_rgba(139,92,246,0.3)]" />
          <p className="text-violet-300 animate-pulse text-sm font-medium tracking-widest uppercase">Initializing</p>
        </div>
      </div>
    );
  }

  if (!player || view.screen === 'auth') {
    return <AuthView onAuthSuccess={handleAuthSuccess} />;
  }

  // Ban Enforcement Check
  if (player?.is_banned && view.screen !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center antialiased">
        <div className="max-w-md w-full bg-slate-900/80 border border-rose-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
            <span className="text-2xl">🚫</span>
          </div>
          <h1 className="text-2xl font-black text-white">Account Banned</h1>
          <p className="text-slate-400 text-xs leading-relaxed">
            Your account (@{player.username}) has been suspended by an administrator due to a violation of our Fair Play policies.
          </p>
          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={() => supabase.auth.signOut()}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view.screen === 'game') {
    return (
      <GameView
        gameId={view.gameId}
        profileId={profileId ?? player.id}
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

  if (view.screen === 'challenge') {
    return (
      <ChallengeView
        initialMode={view.mode}
        initialTargetUser={view.targetUser}
        currentPlayer={player}
        profileId={profileId ?? player.id}
        onBackToLobby={handleBackToLobby}
        onGameStart={handleGameStart}
      />
    );
  }

  if (view.screen === 'admin') {
    return <AdminPanel onBack={handleBackToLobby} />;
  }

  // Default: lobby  — wrap in flex row so sidebar sits next to content
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <div className="flex-1 overflow-hidden">
        <GameLobby
          player={player}
          profileId={profileId ?? player.id}
          onGameStart={handleGameStart}
          onViewProfile={handleViewProfile}
          onCreateChallenge={handleCreateChallenge}
          onOpenAdmin={handleOpenAdmin}
        />
      </div>
      {profileId && (
        <SocialSidebar
          currentProfileId={profileId}
          onViewProfile={handleViewProfile}
        />
      )}
    </div>
  );
}

export default App;