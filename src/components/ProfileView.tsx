import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Player } from '../types/chess';
import {
  ArrowLeft, Trophy, Swords, TrendingUp,
  CalendarDays, ChevronRight, Loader2,
  Zap, Shield, Target, LogOut
} from 'lucide-react';

interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  created_at: string;
}

interface MatchRow {
  id: string;
  white_player_id: string;
  black_player_id: string | null;
  white_player_username: string | null;
  black_player_username: string | null;
  status: string;
  winner: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileViewProps {
  targetUsername: string;
  currentPlayer: Player;
  onBackToLobby: () => void;
  onAnalyzeGame: (gameId: string) => void;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function fmtDuration(created: string, updated: string) {
  const sec = Math.round(
    (new Date(updated).getTime() - new Date(created).getTime()) / 1000
  );
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

type Result = 'WIN' | 'LOSS' | 'DRAW';

export default function ProfileView({
  targetUsername,
  currentPlayer,
  onBackToLobby,
  onAnalyzeGame,
}: ProfileViewProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const isOwn = currentPlayer.username === targetUsername;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const { data: prof, error: pErr } = await supabase
          .from('profiles')
          .select('id, username, full_name, created_at')
          .eq('username', targetUsername)
          .single();

        if (pErr || !prof) {
          if (!cancelled) setError(`Profile "${targetUsername}" not found.`);
          return;
        }
        if (!cancelled) setProfile(prof);

        const { data: games, error: gErr } = await supabase
          .from('games')
          .select(`
            id, white_player_id, black_player_id,
            white_player_username, black_player_username,
            status, winner, created_at, updated_at
          `)
          .or(`white_player_id.eq.${prof.id},black_player_id.eq.${prof.id}`)
          .eq('status', 'finished')
          .order('updated_at', { ascending: false })
          .limit(50);

        if (gErr) throw gErr;
        if (!cancelled) setMatches(games ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [targetUsername]);

  const stats = (() => {
    if (!profile) return { played: 0, wins: 0, losses: 0, draws: 0, winRate: 0 };
    let wins = 0, losses = 0, draws = 0;
    matches.forEach(m => {
      const myColor = m.white_player_id === profile.id ? 'white' : 'black';
      if (m.winner === 'draw') draws++;
      else if (m.winner === myColor) wins++;
      else if (m.winner) losses++;
    });
    const played = wins + losses + draws;
    return { played, wins, losses, draws, winRate: played > 0 ? Math.round((wins / played) * 100) : 0 };
  })();

  const winPercent = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
  const drawPercent = stats.played > 0 ? Math.round((stats.draws / stats.played) * 100) : 0;
  const lossPercent = stats.played > 0 ? Math.max(0, 100 - winPercent - drawPercent) : 0;

  function getResult(m: MatchRow): Result {
    if (!profile) return 'DRAW';
    const myColor = m.white_player_id === profile.id ? 'white' : 'black';
    if (m.winner === 'draw') return 'DRAW';
    if (m.winner === myColor) return 'WIN';
    return 'LOSS';
  }

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
          <p className="text-slate-500 font-mono text-sm tracking-widest uppercase">
            Loading Profile...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-rose-400 font-mono">{error}</p>
        <button
          onClick={onBackToLobby}
          className="group flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 font-bold text-xs"
        >
          <ArrowLeft size={14} /> Back to Lobby
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-8 antialiased relative">
      
      {/* Decorative radial glows */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-violet-600/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-cyan-600/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative max-w-4xl mx-auto z-10">

        {/* Header Navigation Bar */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={onBackToLobby}
            className="group flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-800 bg-slate-900/40 text-slate-400 text-xs font-bold transition-all hover:text-white"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
            Lobby
          </button>

          {isOwn && (
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:border-rose-500/50 text-xs font-bold transition-all duration-200 active:scale-95 disabled:opacity-50"
            >
              {signingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut size={14} />}
              <span>Sign Out</span>
            </button>
          )}
        </div>

        {/* Profile Card Header */}
        <div className="relative overflow-hidden bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-3xl p-8 mb-6 shadow-2xl">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-60" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            
            {/* Hexagon-style Avatar */}
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-600/30 to-cyan-900/30 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                <span className="text-3xl font-extrabold text-cyan-300">
                  {(profile?.username ?? '?')[0].toUpperCase()}
                </span>
              </div>
              {isOwn && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-slate-950 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
              )}
            </div>

            {/* User Meta */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-3xl font-black tracking-tight text-white">
                  {profile?.full_name ?? profile?.username}
                </h1>
                {isOwn && (
                  <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 tracking-wider">
                    OWN PROFILE
                  </span>
                )}
              </div>
              <p className="text-cyan-400 font-mono text-sm mb-3">@{profile?.username}</p>
              <div className="flex flex-wrap gap-4 text-xs text-slate-500 font-mono">
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={12} className="text-slate-600" />
                  JOINED {profile?.created_at ? fmtDate(profile.created_at).toUpperCase() : '—'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap size={12} className="text-slate-600" />
                  {stats.played} MATCHES PLAYED
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <NeonStatCard
            icon={<Target className="w-5 h-5 text-cyan-400" />}
            label="Games Played"
            value={String(stats.played)}
            sub={`${stats.draws} draw${stats.draws !== 1 ? 's' : ''}`}
            color="cyan"
          />
          <NeonStatCard
            icon={<Trophy className="w-5 h-5 text-emerald-400" />}
            label="Wins / Losses"
            value={`${stats.wins} / ${stats.losses}`}
            sub="career record"
            color="emerald"
          />
          <NeonStatCard
            icon={<TrendingUp className="w-5 h-5 text-violet-400" />}
            label="Win Rate"
            value={`${stats.winRate}%`}
            sub={stats.played > 0 ? `from ${stats.played} games` : 'no data yet'}
            color="violet"
          />
        </div>

        {/* Career Ratio Distribution Bar */}
        {stats.played > 0 && (
          <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-2xl p-6 mb-6 shadow-2xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Career Distribution
            </h3>
            <div className="w-full h-4 rounded-full bg-slate-950 overflow-hidden flex mb-3">
              {stats.wins > 0 && (
                <div style={{ width: `${winPercent}%` }} className="bg-emerald-500 h-full transition-all" title={`Wins: ${stats.wins}`} />
              )}
              {stats.draws > 0 && (
                <div style={{ width: `${drawPercent}%` }} className="bg-slate-500 h-full transition-all" title={`Draws: ${stats.draws}`} />
              )}
              {stats.losses > 0 && (
                <div style={{ width: `${lossPercent}%` }} className="bg-rose-500 h-full transition-all" title={`Losses: ${stats.losses}`} />
              )}
            </div>
            <div className="grid grid-cols-3 text-center text-xs font-mono">
              <div className="text-emerald-400 flex flex-col items-center">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Wins</span>
                <span className="font-bold">{stats.wins} ({winPercent}%)</span>
              </div>
              <div className="text-slate-400 flex flex-col items-center border-x border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Draws</span>
                <span className="font-bold">{stats.draws} ({drawPercent}%)</span>
              </div>
              <div className="text-rose-400 flex flex-col items-center">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Losses</span>
                <span className="font-bold">{stats.losses} ({lossPercent}%)</span>
              </div>
            </div>
          </div>
        )}

        {/* Match History */}
        <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl">
          
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <Swords className="w-5 h-5 text-cyan-500" />
              <h2 className="font-bold tracking-widest text-sm font-mono uppercase text-slate-300">
                Match History
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {matches.length} GAME{matches.length !== 1 ? 'S' : ''}
            </span>
          </div>

          {matches.length > 0 && (
            <div className="grid grid-cols-[80px_1fr_90px_120px] gap-2 px-6 py-3 border-b border-slate-850 text-[10px] font-bold font-mono uppercase tracking-widest text-slate-600 bg-slate-950/20">
              <span>Result</span>
              <span>Opponent</span>
              <span className="text-right">Duration</span>
              <span className="text-right">Date</span>
            </div>
          )}

          {matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600 gap-3">
              <Shield className="w-12 h-12 opacity-25" />
              <p className="text-xs font-mono tracking-widest uppercase">No completed matches</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-850">
              {matches.map(m => {
                const result = getResult(m);
                const isWhite = m.white_player_id === profile?.id;
                const opponent = isWhite ? m.black_player_username : m.white_player_username;
                const myColor = isWhite ? 'White ♔' : 'Black ♚';

                const rowBg =
                  result === 'WIN'
                    ? 'bg-emerald-950/15 hover:bg-emerald-950/30'
                    : result === 'LOSS'
                    ? 'bg-rose-950/15 hover:bg-rose-950/30'
                    : 'hover:bg-slate-900/40';

                return (
                  <div
                    key={m.id}
                    className={`grid grid-cols-[80px_1fr_90px_120px] gap-2 px-6 py-4 items-center transition-colors duration-150 ${rowBg}`}
                  >
                    <div>
                      <ResultBadge result={result} />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        vs{' '}
                        <span className={
                          result === 'WIN' ? 'text-emerald-400'
                          : result === 'LOSS' ? 'text-rose-400'
                          : 'text-slate-400'
                        }>
                          {opponent ?? 'Unknown'}
                        </span>
                        <span className="ml-2 text-[10px] font-mono text-slate-600 tracking-wide">
                          [{myColor}]
                        </span>
                      </p>
                    </div>

                    <div className="text-right text-xs font-mono text-slate-400">
                      {fmtDuration(m.created_at, m.updated_at)}
                    </div>

                    <div className="text-right flex items-center justify-end gap-3">
                      <span className="text-xs font-mono text-slate-400">{fmtDate(m.created_at)}</span>
                      <button
                        onClick={() => onAnalyzeGame(m.id)}
                        className="group p-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 hover:bg-cyan-500/20 transition-all"
                        title="Analyze Game"
                      >
                        <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

type StatColor = 'cyan' | 'emerald' | 'violet';

function NeonStatCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: StatColor;
}) {
  const styles: Record<StatColor, string> = {
    cyan:    'border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)] hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]',
    emerald: 'border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]',
    violet:  'border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.1)] hover:shadow-[0_0_20px_rgba(139,92,246,0.2)]',
  };

  return (
    <div className={`bg-slate-900/60 border backdrop-blur-md rounded-2xl p-6 flex flex-col gap-3 transition-all duration-300 ${styles[color]}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-slate-950/50">{icon}</div>
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500">
          {label}
        </span>
      </div>
      <p className="text-4xl font-black font-mono text-white tracking-tight leading-none">
        {value}
      </p>
      <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wide">{sub}</p>
    </div>
  );
}

function ResultBadge({ result }: { result: Result }) {
  const styles: Record<Result, string> = {
    WIN:  'bg-emerald-950/30 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]',
    LOSS: 'bg-rose-950/30 text-rose-400 border border-rose-500/30 shadow-[0_0_8px_rgba(244,63,94,0.1)]',
    DRAW: 'bg-slate-800/50 text-slate-400 border border-slate-650/40',
  };

  return (
    <span className={`inline-flex items-center justify-center w-16 py-1.5 rounded-lg text-[10px] font-bold font-mono tracking-widest ${styles[result]}`}>
      {result}
    </span>
  );
}
