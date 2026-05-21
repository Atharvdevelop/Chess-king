import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Player } from '../types/chess';
import {
  ArrowLeft, Trophy, Swords, TrendingUp,
  CalendarDays, Clock, ChevronRight, Loader2,
  Zap, Shield, Target
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

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

  const isOwn = currentPlayer.username === targetUsername;

  // ── Data fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        // 1. Resolve profile by username
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

        // 2. Fetch finished games relationally
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

  // ── Stats ───────────────────────────────────────────────────────────────────
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

  function getResult(m: MatchRow): Result {
    if (!profile) return 'DRAW';
    const myColor = m.white_player_id === profile.id ? 'white' : 'black';
    if (m.winner === 'draw') return 'DRAW';
    if (m.winner === myColor) return 'WIN';
    return 'LOSS';
  }

  // ── Loading / Error ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center">
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
      <div className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-rose-400 font-mono">{error}</p>
        <button onClick={onBackToLobby} className="neon-back-btn">
          <ArrowLeft size={15} /> BACK TO LOBBY
        </button>
      </div>
    );
  }

  // ── Main Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 p-4 lg:p-8">

      {/* Ambient grid overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(6,182,212,1) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative max-w-4xl mx-auto">

        {/* ── Back button ── */}
        <button
          onClick={onBackToLobby}
          className="group flex items-center gap-2 mb-8 px-4 py-2 rounded-lg
            border border-cyan-500/30 bg-cyan-500/5
            text-cyan-400 text-xs font-mono tracking-widest uppercase
            hover:bg-cyan-500/15 hover:border-cyan-400/60
            shadow-[0_0_10px_rgba(6,182,212,0.1)]
            hover:shadow-[0_0_18px_rgba(6,182,212,0.25)]
            transition-all duration-200"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
          ← Back to Lobby
        </button>

        {/* ── Profile Header ── */}
        <div className="relative overflow-hidden bg-slate-900/60 border border-slate-800
          backdrop-blur-md rounded-xl p-8 mb-6
          shadow-[0_0_30px_rgba(6,182,212,0.05)]">

          {/* Neon top edge */}
          <div className="absolute top-0 left-0 right-0 h-[2px]
            bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-60" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">

            {/* Avatar hexagon-ish */}
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-600/30 to-cyan-900/30
                border border-cyan-500/40 flex items-center justify-center
                shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                <span className="text-3xl font-bold font-mono text-cyan-300">
                  {(profile?.username ?? '?')[0].toUpperCase()}
                </span>
              </div>
              {isOwn && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full
                  border-2 border-[#0B0F19] shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              )}
            </div>

            {/* Name & meta */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-3xl font-extrabold tracking-tight text-white">
                  {profile?.full_name ?? profile?.username}
                </h1>
                {isOwn && (
                  <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold
                    bg-cyan-500/10 text-cyan-400 border border-cyan-500/30
                    shadow-[0_0_8px_rgba(6,182,212,0.2)] tracking-widest">
                    YOU
                  </span>
                )}
              </div>
              <p className="text-cyan-600 font-mono text-sm mb-3">@{profile?.username}</p>
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

        {/* ── Stats Grid ── */}
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

        {/* ── Match History ── */}
        <div className="bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-xl
          overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.4)]">

          {/* Table header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <Swords className="w-5 h-5 text-cyan-500" />
              <h2 className="font-bold tracking-widest text-sm font-mono uppercase text-slate-300">
                Match History
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-600">
              {matches.length} GAME{matches.length !== 1 ? 'S' : ''}
            </span>
          </div>

          {/* Column labels */}
          {matches.length > 0 && (
            <div className="grid grid-cols-[80px_1fr_90px_120px] gap-2 px-6 py-2
              border-b border-slate-800/60 text-[10px] font-mono uppercase tracking-widest text-slate-600">
              <span>Result</span>
              <span>Opponent</span>
              <span className="text-right">Duration</span>
              <span className="text-right">Date</span>
            </div>
          )}

          {/* Rows */}
          {matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600 gap-3">
              <Shield className="w-12 h-12 opacity-20" />
              <p className="text-sm font-mono tracking-widest uppercase">No completed matches</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/40">
              {matches.map(m => {
                const result = getResult(m);
                const isWhite = m.white_player_id === profile?.id;
                const opponent = isWhite ? m.black_player_username : m.white_player_username;
                const myColor = isWhite ? 'White ♔' : 'Black ♚';

                // Row background glow per result
                const rowBg =
                  result === 'WIN'
                    ? 'bg-emerald-950/30 hover:bg-emerald-950/50'
                    : result === 'LOSS'
                    ? 'bg-rose-950/30 hover:bg-rose-950/50'
                    : 'hover:bg-slate-800/30';

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4
                      transition-colors duration-150 ${rowBg}`}
                  >
                    {/* Result Badge */}
                    <div className="shrink-0 w-[72px]">
                      <ResultBadge result={result} />
                    </div>

                    {/* Opponent + meta */}
                    <div className="flex-1 min-w-0">
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
                      <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-slate-600">
                        <span className="flex items-center gap-1">
                          <Clock size={10} /> {fmtDuration(m.created_at, m.updated_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarDays size={10} /> {fmtDate(m.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Analyze button */}
                    <button
                      onClick={() => onAnalyzeGame(m.id)}
                      className="group flex items-center gap-1.5 px-4 py-2 rounded-lg shrink-0
                        border border-cyan-500/30 bg-cyan-500/5 text-cyan-400
                        text-xs font-mono font-bold tracking-widest uppercase
                        hover:bg-cyan-500/20 hover:border-cyan-400/60
                        shadow-[0_0_8px_rgba(6,182,212,0.1)]
                        hover:shadow-[0_0_15px_rgba(6,182,212,0.25)]
                        transition-all duration-200"
                    >
                      Analyze
                      <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
    cyan:    'border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:shadow-[0_0_25px_rgba(6,182,212,0.25)]',
    emerald: 'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:shadow-[0_0_25px_rgba(16,185,129,0.25)]',
    violet:  'border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:shadow-[0_0_25px_rgba(139,92,246,0.25)]',
  };

  return (
    <div className={`bg-slate-900/60 border backdrop-blur-md rounded-xl p-6
      flex flex-col gap-4 transition-shadow duration-300 ${styles[color]}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-slate-800/60">{icon}</div>
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500">
          {label}
        </span>
      </div>
      <p className="text-4xl font-extrabold font-mono text-white tracking-tight leading-none">
        {value}
      </p>
      <p className="text-[10px] font-mono text-slate-600 uppercase tracking-wide">{sub}</p>
    </div>
  );
}

function ResultBadge({ result }: { result: Result }) {
  const styles: Record<Result, string> = {
    WIN:  'bg-emerald-950/30 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]',
    LOSS: 'bg-rose-950/30 text-rose-400 border border-rose-500/30 shadow-[0_0_8px_rgba(244,63,94,0.1)]',
    DRAW: 'bg-slate-800/50 text-slate-400 border border-slate-600/40',
  };

  return (
    <span className={`inline-flex items-center justify-center w-16 py-1.5 rounded-lg
      text-[10px] font-mono font-extrabold tracking-widest ${styles[result]}`}>
      {result}
    </span>
  );
}
