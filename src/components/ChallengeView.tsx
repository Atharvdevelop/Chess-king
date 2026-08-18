import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Player } from '../types/chess';
import { ArrowLeft, Clock, Send } from 'lucide-react';

interface ChallengeViewProps {
  initialMode?: 'open' | 'direct';
  initialTargetUser?: string;
  currentPlayer: Player;
  profileId: string;
  onBackToLobby: () => void;
  onGameStart: (id: string) => void;
}

type TabMode = 'open' | 'direct';

export default function ChallengeView({
  initialMode = 'open',
  initialTargetUser = '',
  currentPlayer,
  profileId,
  onBackToLobby,
  onGameStart,
}: ChallengeViewProps) {
  const [tab, setTab] = useState<TabMode>(initialMode);
  const [selectedFormat, setSelectedFormat] = useState('1+0');
  
  // Custom formats
  const [customMinutes, setCustomMinutes] = useState(10);
  const [customIncrement, setCustomIncrement] = useState(0);

  // Direct Challenge Form State
  const [targetUsername, setTargetUsername] = useState(initialTargetUser);
  const [usernameHint, setUsernameHint] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [sendingDirect, setSendingDirect] = useState(false);

  // Matchmaking / Waiting overlays
  const [showDirectWaiting, setShowDirectWaiting] = useState(false);
  const [showOpenWaiting, setShowOpenWaiting] = useState(false);
  const [pendingChallengeId, setPendingChallengeId] = useState<string | null>(null);

  
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Realtime channels / Ref timers
  const elapsedIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const directSubRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const openSubRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Polling fallback — fires every 3s while waiting for challenge acceptance
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Time format config list
  const formatList = [
    { value: '1+0', title: 'Bullet', label: '1 min', desc: '+0 increment', bg: 'rgba(245,158,11,0.12)', color: '#fbbf24' },
    { value: '3+2', title: 'Blitz', label: '3 + 2', desc: '3 min + 2s', bg: 'rgba(239,68,68,0.12)', color: '#f87171' },
    { value: '5+0', title: 'Blitz', label: '5 min', desc: '+0 increment', bg: 'rgba(239,68,68,0.12)', color: '#f87171' },
    { value: '10+0', title: 'Rapid', label: '10 min', desc: '+0 increment', bg: 'rgba(52,211,153,0.12)', color: '#34d399' },
    { value: '15+10', title: 'Rapid', label: '15 + 10', desc: '15 min + 10s', bg: 'rgba(52,211,153,0.12)', color: '#34d399' },
    { value: 'custom', title: 'Custom', label: 'Custom', desc: 'Choose rules', bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' }
  ];

  const activeFormat = formatList.find(f => f.value === selectedFormat) || formatList[0];

  // ─── Auto-validate username on url-params ─────────────────────────────────
  useEffect(() => {
    if (initialTargetUser) {
      validateOpponentUsername(initialTargetUser);
    }
  }, [initialTargetUser]);

  // ─── Username Verification ────────────────────────────────────────────────
  const validateOpponentUsername = async (name: string) => {
    const val = name.trim();
    if (val.length === 0) {
      setUsernameHint(null);
      setUsernameStatus('idle');
      return;
    }
    if (val.length < 3) {
      setUsernameHint('Username must be at least 3 characters.');
      setUsernameStatus('invalid');
      return;
    }
    if (!/^[A-Za-z0-9_\-]+$/.test(val)) {
      setUsernameHint('May only contain letters, numbers, underscores, or hyphens.');
      setUsernameStatus('invalid');
      return;
    }
    if (val.toLowerCase() === currentPlayer.username.toLowerCase()) {
      setUsernameHint("You can't challenge yourself!");
      setUsernameStatus('invalid');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', val)
        .maybeSingle();

      if (error || !data) {
        setUsernameHint(`Player "${val}" not found (case-sensitive check).`);
        setUsernameStatus('invalid');
      } else {
        setUsernameHint(`✓ Ready to challenge ${val}`);
        setUsernameStatus('valid');
      }
    } catch {
      setUsernameHint('Spelling validation error.');
      setUsernameStatus('invalid');
    }
  };

  const handleUsernameChange = (v: string) => {
    setTargetUsername(v);
    validateOpponentUsername(v);
  };

  // ─── Ticker Helper ────────────────────────────────────────────────────────
  const startElapsedTimer = () => {
    setElapsedSeconds(0);
    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    elapsedIntervalRef.current = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);
  };

  const stopElapsedTimer = () => {
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  };

  // ─── DIRECT CHALLENGE: SUBMIT ─────────────────────────────────────────────
  const handleSendDirectChallenge = async () => {
    const target = targetUsername.trim();
    if (usernameStatus !== 'valid' || !target || sendingDirect) return;
    setSendingDirect(true);

    try {
      // 1. Resolve opponent's player uuid from the players table
      //    (challenges table references players.id, not profiles.id)
      const { data: opponentPlayer, error: opErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', target)
        .maybeSingle();

      if (opErr) throw opErr;
      if (!opponentPlayer) throw new Error(`Player "${target}" not found. They may not have logged in yet.`);

      let timeFormat = selectedFormat;
      if (timeFormat === 'custom') {
        timeFormat = `${customMinutes}+${customIncrement}`;
      }

      // 2. Insert into challenges table
      const { data: challenge, error: chalErr } = await supabase
        .from('challenges')
        .insert({
          challenger_id: profileId,
          challenged_id: opponentPlayer.id,
          status: 'pending',
          time_format: timeFormat,
        })
        .select('id')
        .single();

      if (chalErr) throw chalErr;

      setPendingChallengeId(challenge.id);
      startElapsedTimer();
      setShowDirectWaiting(true);

      // 3a. Primary: Realtime subscription — fastest path but can silently fail
      //     if RLS blocks SELECT on challenges for this user.
      if (directSubRef.current) supabase.removeChannel(directSubRef.current);
      directSubRef.current = supabase
        .channel(`challenge-state-${challenge.id}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'challenges', filter: `id=eq.${challenge.id}`
        }, (payload) => {
          const row = payload.new as { status?: string; game_id?: string };
          if (!row) return;

          if (row.status === 'accepted' && row.game_id) {
            cleanupDirect();
            onGameStart(row.game_id);
          } else if (row.status === 'rejected' || row.status === 'declined') {
            cleanupDirect();
            setUsernameHint('Challenge declined by opponent.');
            setUsernameStatus('invalid');
          }
        })
        .subscribe();

      // 3b. Fallback: poll every 3 seconds — guarantees redirect even if
      //     realtime event is dropped (e.g. due to RLS misconfiguration).
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const { data } = await supabase
          .from('challenges')
          .select('status, game_id')
          .eq('id', challenge.id)
          .maybeSingle();

        if (!data) return;
        if (data.status === 'accepted' && data.game_id) {
          cleanupDirect();
          onGameStart(data.game_id);
        } else if (data.status === 'rejected' || data.status === 'declined') {
          cleanupDirect();
          setUsernameHint('Challenge declined by opponent.');
          setUsernameStatus('invalid');
        }
      }, 3000);

    } catch (err: any) {
      console.error(err);
      setUsernameHint(err.message || 'Failed to dispatch challenge.');
      setUsernameStatus('invalid');
    } finally {
      setSendingDirect(false);
    }
  };

  const handleCancelDirect = async () => {
    if (pendingChallengeId) {
      await supabase.from('challenges').delete().eq('id', pendingChallengeId);
    }
    cleanupDirect();
  };

  const cleanupDirect = () => {
    stopElapsedTimer();
    setShowDirectWaiting(false);
    setPendingChallengeId(null);
    // Stop the polling fallback
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (directSubRef.current) {
      supabase.removeChannel(directSubRef.current);
      directSubRef.current = null;
    }
  };

  // ─── OPEN MATCHMAKING: QUEUE ──────────────────────────────────────────────
  const handleFindMatch = async () => {
    let timeFormat = selectedFormat;
    if (timeFormat === 'custom') {
      timeFormat = `${customMinutes}+${customIncrement}`;
    }

    setShowOpenWaiting(true);
    startElapsedTimer();

    try {
      // 1. Check for open waiting matches
      const { data: candidates } = await supabase
        .from('matchmaking_queue')
        .select('id, user_id, username')
        .eq('time_format', timeFormat)
        .is('game_id', null)
        .neq('user_id', profileId)
        .order('created_at', { ascending: true })
        .limit(1);

      if (candidates && candidates.length > 0) {
        // Match found! Pair up
        const opponent = candidates[0];
        const { data: gameId, error: rpcErr } = await supabase
          .rpc('initialize_open_match', {
            p_queue_row_id: opponent.id,
            p_joiner_id: profileId,
            p_joiner_username: currentPlayer.username,
            p_time_format: timeFormat
          });

        if (rpcErr) {
          if (rpcErr.message?.includes('match_already_claimed')) {
            // Join queue on collision race
            await joinOpenQueue(timeFormat);
          } else {
            throw rpcErr;
          }
        } else {
          cleanupOpen();
          onGameStart(gameId);
        }
      } else {
        // None found, insert ourselves
        await joinOpenQueue(timeFormat);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Pairing error.');
      cleanupOpen();
    }
  };

  const joinOpenQueue = async (fmt: string) => {
    const { data: queueRow, error } = await supabase
      .from('matchmaking_queue')
      .upsert(
        { user_id: profileId, username: currentPlayer.username, time_format: fmt, game_id: null },
        { onConflict: 'user_id', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (error) throw error;

    // 3a. Primary: Realtime subscription
    if (openSubRef.current) supabase.removeChannel(openSubRef.current);
    openSubRef.current = supabase
      .channel(`open-pairing-${queueRow.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matchmaking_queue', filter: `id=eq.${queueRow.id}`
      }, (payload) => {
        const row = payload.new;
        if (row && row.game_id) {
          cleanupOpen();
          onGameStart(row.game_id);
        }
      })
      .subscribe();

    // 3b. Fallback: poll every 3 seconds in case realtime misses the event
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('matchmaking_queue')
        .select('game_id')
        .eq('id', queueRow.id)
        .maybeSingle();

      if (data?.game_id) {
        cleanupOpen();
        onGameStart(data.game_id);
      }
    }, 3000);
  };

  const handleCancelOpen = async () => {
    await supabase.from('matchmaking_queue').delete().eq('user_id', profileId);
    cleanupOpen();
  };

  const cleanupOpen = () => {
    stopElapsedTimer();
    setShowOpenWaiting(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (openSubRef.current) {
      supabase.removeChannel(openSubRef.current);
      openSubRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupDirect();
      cleanupOpen();
    };
  }, []);

  const formatElapsed = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-8 relative flex flex-col justify-center items-center w-full">
      
      {/* Decorative radial glows */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-violet-600/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-600/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-2xl relative z-10">
        
        {/* Back Link */}
        <button
          onClick={onBackToLobby}
          className="group flex items-center gap-2 mb-8 px-4 py-2 rounded-lg
            border border-slate-800 bg-slate-900/40 text-slate-400 text-xs font-semibold
            hover:text-white hover:border-slate-700 transition-all duration-200"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
          Lobby
        </button>

        {/* Card Frame (Glassmorphism dark panel) */}
        <div className="glass-panel bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl font-extrabold text-white">Create Challenge</h1>
            <p className="text-slate-400 text-xs mt-1">Configure your time control format and match up.</p>
          </div>

          {/* Mode Selector Tab Bar */}
          <div className="flex border-b border-slate-805 mb-8">
            <button
              onClick={() => setTab('open')}
              className={`flex-1 pb-4 text-center font-bold text-sm border-b-2 transition-all ${
                tab === 'open' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Open Matchmaking
            </button>
            <button
              onClick={() => setTab('direct')}
              className={`flex-1 pb-4 text-center font-bold text-sm border-b-2 transition-all ${
                tab === 'direct' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Direct Challenge
            </button>
          </div>

          {/* Time Controls Selector */}
          <div className="mb-8">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Time Control
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {formatList.map((fmt) => (
                <div
                  key={fmt.value}
                  onClick={() => setSelectedFormat(fmt.value)}
                  className={`border rounded-2xl p-4 cursor-pointer text-center transition-all ${
                    selectedFormat === fmt.value
                      ? 'border-violet-500 bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
                      : 'border-slate-800 bg-slate-950/20 hover:border-slate-700'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: fmt.bg, color: fmt.color }}>
                    {fmt.title}
                  </span>
                  <div className="text-xl font-bold text-white mt-1.5">{fmt.label}</div>
                  <span className="text-xs text-slate-500 font-medium">{fmt.desc}</span>
                </div>
              ))}
            </div>

            {/* Custom Inputs */}
            {selectedFormat === 'custom' && (
              <div className="grid grid-cols-2 gap-4 mt-4 animate-fadeIn">
                <div>
                  <label htmlFor="mins" className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
                    Minutes per side
                  </label>
                  <input
                    id="mins"
                    type="number"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(Math.max(1, parseInt(e.target.value, 10) || 10))}
                    min="1" max="180"
                    className="w-full bg-slate-950/40 border border-slate-805 rounded-xl px-4 py-2.5 text-white outline-none focus:border-violet-500 text-sm animate-pulse-once"
                  />
                </div>
                <div>
                  <label htmlFor="inc" className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
                    Increment (seconds)
                  </label>
                  <input
                    id="inc"
                    type="number"
                    value={customIncrement}
                    onChange={(e) => setCustomIncrement(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    min="0" max="60"
                    className="w-full bg-slate-950/40 border border-slate-805 rounded-xl px-4 py-2.5 text-white outline-none focus:border-violet-500 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Open Challenge Panel */}
          {tab === 'open' && (
            <div className="space-y-6">
              <p className="text-xs text-slate-500 leading-relaxed">
                Your entry will be listed on the matchmaking queue. If another player searches for the same format, you will be paired up instantly.
              </p>
              <button
                onClick={handleFindMatch}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-3.5 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-violet-600/25 hover:shadow-violet-600/35 flex items-center justify-center gap-2 active:scale-95"
              >
                <span>Find Match</span>
                <Clock size={16} />
              </button>
            </div>
          )}

          {/* Direct Challenge Panel */}
          {tab === 'direct' && (
            <div className="space-y-6">
              <div>
                <label htmlFor="opponent-name" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Opponent's Username <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-slate-600 font-bold text-sm pointer-events-none">@</span>
                  <input
                    id="opponent-name"
                    type="text"
                    value={targetUsername}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    placeholder="Enter unique username..."
                    autoComplete="off"
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-800 bg-slate-950/40 text-white placeholder:text-slate-600 text-sm outline-none focus:border-violet-500 transition-all"
                  />
                </div>
                {usernameHint && (
                  <p className={`text-[10px] mt-1.5 font-semibold ${
                    usernameStatus === 'valid' ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {usernameHint}
                  </p>
                )}
              </div>

              <button
                onClick={handleSendDirectChallenge}
                disabled={usernameStatus !== 'valid'}
                className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 disabled:from-slate-800 disabled:to-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-cyan-600/20 flex items-center justify-center gap-2 active:scale-95"
              >
                <Send size={16} />
                <span>Send Challenge Invitation</span>
              </button>
            </div>
          )}

          {/* Open Match Waiting Overlay */}
          {showOpenWaiting && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
              <div className="relative w-20 h-20 flex items-center justify-center mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-violet-500/20 border-t-violet-500 animate-spin"></div>
                <Clock className="w-8 h-8 text-violet-400 animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-white">Searching for Opponent</h3>
              <p className="text-slate-400 text-xs mt-2 max-w-sm">
                Waiting in queue for a {activeFormat.label} format match...
              </p>
              <p className="text-[11px] text-slate-500 font-mono mt-3">
                Elapsed: {formatElapsed(elapsedSeconds)}
              </p>
              <button
                onClick={handleCancelOpen}
                className="mt-8 border border-slate-850 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-950 text-slate-300 font-semibold px-6 py-2.5 rounded-xl transition-all text-xs"
              >
                Cancel Search
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Direct Invite Waiting Modal */}
      {showDirectWaiting && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-sm mx-4 glass-panel bg-slate-900/80 border border-slate-800/80 backdrop-blur-md rounded-3xl p-8 text-center shadow-2xl overflow-hidden">
            
            {/* Pulsing indicator */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full border-4 border-violet-500/20 border-t-violet-500 border-b-cyan-500 animate-spin"></div>
            </div>

            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-1">Direct Invite Dispatched</p>
            <h2 className="text-lg font-bold text-white">
              Waiting for <span className="text-cyan-400">{targetUsername}</span>
            </h2>
            <p className="text-slate-505 text-xs mt-1">
              Time format: {selectedFormat === 'custom' ? `${customMinutes}m+${customIncrement}s` : activeFormat.label}
            </p>

            <div className="my-5 border-t border-slate-850"></div>

            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <div className="w-9 h-9 rounded-full bg-violet-600/30 border border-violet-500/30 flex items-center justify-center text-sm font-bold text-violet-300 uppercase">
                  {currentPlayer.username.charAt(0)}
                </div>
                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[80px]">{currentPlayer.username}</span>
              </div>
              <div className="text-[10px] uppercase font-bold text-slate-650">vs</div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-9 h-9 rounded-full bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-sm font-bold text-cyan-300 uppercase animate-pulse">
                  {targetUsername.charAt(0)}
                </div>
                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[80px]">{targetUsername}</span>
              </div>
            </div>

            <p className="mt-5 text-[11px] text-slate-500">
              Waiting time: <span className="font-mono text-slate-400">{elapsedSeconds}s</span>
            </p>

            <button
              onClick={handleCancelDirect}
              className="mt-6 w-full border border-slate-800 hover:border-rose-500/30 bg-slate-950/40 hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 font-bold py-2.5 rounded-xl transition-all text-xs"
            >
              Cancel Invitation
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
