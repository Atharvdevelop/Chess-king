import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Player } from '../types/chess';
import {
  ArrowLeft, Trophy, Swords, TrendingUp,
  CalendarDays, ChevronRight, Loader2,
  Zap, Target, LogOut, Edit3, Check, X, AlertTriangle, Flag
} from 'lucide-react';

interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  bio?: string | null;
  rating?: number | null;
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

  // Bio state
  const [bioText, setBioText] = useState('');
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [savingBio, setSavingBio] = useState(false);

  // Report Modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('Cheating / Engine');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const isOwn = currentPlayer.username === targetUsername;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const { data: prof, error: pErr } = await supabase
          .from('profiles')
          .select('id, username, full_name, bio, rating, created_at')
          .eq('username', targetUsername)
          .single();

        if (pErr || !prof) {
          if (!cancelled) setError(`Profile "${targetUsername}" not found.`);
          return;
        }
        if (!cancelled) {
          setProfile(prof);
          setBioText(prof.bio || '');
        }

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

  function getResult(m: MatchRow): Result {
    if (!profile) return 'DRAW';
    const myColor = m.white_player_id === profile.id ? 'white' : 'black';
    if (m.winner === 'draw') return 'DRAW';
    if (m.winner === myColor) return 'WIN';
    return 'LOSS';
  }

  const handleSaveBio = async () => {
    if (!profile || savingBio) return;
    setSavingBio(true);
    try {
      await supabase.from('profiles').update({ bio: bioText }).eq('id', profile.id);
      await supabase.from('players').update({ bio: bioText }).eq('id', profile.id);
      setProfile({ ...profile, bio: bioText });
      setIsEditingBio(false);
    } catch (err) {
      console.error('Failed to save bio:', err);
    } finally {
      setSavingBio(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!profile || submittingReport) return;
    setSubmittingReport(true);
    try {
      await supabase.from('reports').insert({
        reporter_id: currentPlayer.id,
        reporter_name: currentPlayer.username,
        reported_id: profile.id,
        reported_name: profile.username,
        reason: reportReason,
        details: reportDetails,
        status: 'pending',
      });
      setReportSubmitted(true);
    } catch (err) {
      console.error('Failed to submit report:', err);
    } finally {
      setSubmittingReport(false);
    }
  };

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

          <div className="flex items-center gap-3">
            {!isOwn && (
              <button
                onClick={() => {
                  setShowReportModal(true);
                  setReportSubmitted(false);
                }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-500/50 text-xs font-bold transition-all duration-200"
              >
                <Flag size={14} />
                <span>Report Player</span>
              </button>
            )}

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
        </div>

        {/* Profile Card Header */}
        <div className="relative overflow-hidden bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-3xl p-8 mb-6 shadow-2xl">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-60" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            
            {/* Avatar */}
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
                <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-violet-500/10 text-violet-300 border border-violet-500/30 flex items-center gap-1">
                  ⚡ {profile?.rating ?? 1200} ELO
                </span>
              </div>
              <p className="text-cyan-400 font-mono text-sm mb-3">@{profile?.username}</p>
              
              <div className="flex flex-wrap gap-4 text-xs text-slate-500 font-mono mb-4">
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={12} className="text-slate-600" />
                  JOINED {profile?.created_at ? fmtDate(profile.created_at).toUpperCase() : '—'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap size={12} className="text-slate-600" />
                  {stats.played} MATCHES PLAYED
                </span>
              </div>

              {/* Player Description / Bio Box */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-300">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Player Description</span>
                  {isOwn && !isEditingBio && (
                    <button
                      onClick={() => setIsEditingBio(true)}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
                    >
                      <Edit3 size={12} /> Edit Bio
                    </button>
                  )}
                </div>

                {isEditingBio ? (
                  <div className="space-y-3">
                    <textarea
                      value={bioText}
                      onChange={e => setBioText(e.target.value)}
                      placeholder="Write something about your chess style, goals, or favorite openings..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 min-h-[70px]"
                      maxLength={300}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsEditingBio(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs font-bold hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveBio}
                        disabled={savingBio}
                        className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        {savingBio ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Save Bio
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-300 italic text-xs leading-relaxed">
                    {profile?.bio || (isOwn ? "No description set yet. Click 'Edit Bio' to add one!" : "No description provided.")}
                  </p>
                )}
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
            value={`${stats.wins}W - ${stats.losses}L`}
            sub={`${stats.winRate}% win rate`}
            color="emerald"
          />
          <NeonStatCard
            icon={<TrendingUp className="w-5 h-5 text-violet-400" />}
            label="Rating"
            value={`${profile?.rating ?? 1200} ELO`}
            sub="Blitz & Rapid"
            color="violet"
          />
        </div>

        {/* Match History */}
        <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-3xl p-6 shadow-2xl">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Swords className="w-5 h-5 text-violet-400" /> Recent Matches
          </h2>

          {matches.length === 0 ? (
            <p className="text-slate-500 text-xs font-mono py-8 text-center">
              No completed matches found for this player.
            </p>
          ) : (
            <div className="space-y-2.5">
              {matches.map(m => {
                const res = getResult(m);
                const isWhite = m.white_player_id === profile?.id;
                const oppName = isWhite
                  ? (m.black_player_username || 'Opponent')
                  : (m.white_player_username || 'Opponent');

                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3.5 bg-slate-950/50 border border-slate-850 rounded-xl hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider uppercase ${
                          res === 'WIN'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : res === 'LOSS'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {res}
                      </span>

                      <div>
                        <div className="text-xs font-bold text-slate-200">
                          vs @{oppName} ({isWhite ? 'White' : 'Black'})
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {fmtDate(m.created_at)} • Duration {fmtDuration(m.created_at, m.updated_at)}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onAnalyzeGame(m.id)}
                      className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-semibold px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-all"
                    >
                      <span>Analyze</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Report Player Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Report Player @{profile?.username}
              </h3>
              <button onClick={() => setShowReportModal(false)} className="text-slate-500 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {reportSubmitted ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                  <Check size={24} />
                </div>
                <h4 className="text-sm font-bold text-white">Report Submitted</h4>
                <p className="text-xs text-slate-400">
                  Thank you for keeping Chess King fair. Our admin team will review this incident.
                </p>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Reason for Report</label>
                  <select
                    value={reportReason}
                    onChange={e => setReportReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Cheating / Engine">Cheating / Engine assistance</option>
                    <option value="Harassment / Toxicity">Harassment or Toxic Chat</option>
                    <option value="Stalling / Sandbagging">Stalling or Intentional Abandonment</option>
                    <option value="Inappropriate Username">Inappropriate Username or Bio</option>
                    <option value="Other">Other Violation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Details (Optional)</label>
                  <textarea
                    value={reportDetails}
                    onChange={e => setReportDetails(e.target.value)}
                    placeholder="Provide context or game details..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 min-h-[80px]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs font-bold hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitReport}
                    disabled={submittingReport}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    {submittingReport ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />}
                    Submit Report
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: 'cyan' | 'emerald' | 'violet';
}

function NeonStatCard({ icon, label, value, sub, color }: StatProps) {
  const borderMap = {
    cyan: 'border-cyan-500/30 hover:border-cyan-500/60',
    emerald: 'border-emerald-500/30 hover:border-emerald-500/60',
    violet: 'border-violet-500/30 hover:border-violet-500/60',
  };

  return (
    <div className={`p-5 rounded-2xl bg-slate-900/60 border ${borderMap[color]} backdrop-blur-md transition-all duration-300 hover:-translate-y-1 shadow-lg`}>
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
          {icon}
        </div>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-black text-white mb-0.5">{value}</div>
      <div className="text-[11px] font-mono text-slate-500">{sub}</div>
    </div>
  );
}
