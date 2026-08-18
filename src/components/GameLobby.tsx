import { useState, useEffect, useRef } from 'react';
import { Player, Challenge } from '../types/chess';
import {
  getLobbyPlayers,
  getPendingChallenges,
  acceptChallenge,
  rejectChallenge,
  subscribeToChallenges,
  subscribeToChallengeAccepted,
  updateHeartbeat,
  getActiveMatches
} from '../lib/gameService';
import { supabase } from '../lib/supabase';
import { Users, Check, X, Eye, Play, Plus, MessageSquare, Send, Shield, Megaphone } from 'lucide-react';
import NavDrawer from './NavDrawer';

interface GameLobbyProps {
  player: Player;
  profileId: string;
  onGameStart: (id: string) => void;
  onViewProfile: (username: string) => void;
  onCreateChallenge: (mode?: 'open' | 'direct', targetUser?: string) => void;
  onOpenAdmin?: () => void;
  onSelectOfflineDual: () => void;
}

interface ChatMessage {
  username: string;
  text: string;
  timestamp: string;
}

export default function GameLobby({
  player,
  profileId,
  onGameStart,
  onViewProfile,
  onCreateChallenge,
  onOpenAdmin,
  onSelectOfflineDual,
}: GameLobbyProps) {
  // Data States
  const [onlinePlayers, setOnlinePlayers] = useState<Player[]>([]);
  const [activeMatches, setActiveMatches] = useState<{ game_id: string; white_player: string; black_player: string; status?: string }[]>([]);
  const [pendingChallenges, setPendingChallenges] = useState<Challenge[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState<string | null>(null);

  // Global Chat States
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refreshData = async () => {
    try {
      // Lobby view filters out busy players
      const players = await getLobbyPlayers(profileId);
      setOnlinePlayers(players);

      const challenges = await getPendingChallenges(profileId);
      setPendingChallenges(challenges);

      const matches = await getActiveMatches();
      setActiveMatches(matches);
    } catch (err) {
      console.error('Lobby refresh error:', err);
    }
  };

  // ─── 1. REALTIME & HEARTBEAT SYNC ──────────────────────────────────────────
  useEffect(() => {
    refreshData();

    // Heartbeat: Keep online status refreshed
    const heartbeat = setInterval(() => updateHeartbeat(profileId), 10000);

    // Refresh poller: auto-remove idle player rows
    const poller = setInterval(refreshData, 15000);

    // Sub to challenges
    const generalChannel = subscribeToChallenges(profileId, () => {
      refreshData();
    });

    // Nuclear Fix challenge auto-redirect
    const redirectChannel = subscribeToChallengeAccepted(profileId, (gameId, opponentName) => {
      setNotification(`🎉 Match accepted! Entering room with ${opponentName}...`);
      setTimeout(() => {
        onGameStart(gameId);
      }, 2000);
    });

    // Global Announcement listener
    const bcastChannel = supabase.channel('global-announcements')
      .on('broadcast', { event: 'announcement' }, (payload) => {
        if (payload?.payload?.message) {
          setBroadcastMessage(payload.payload.message);
        }
      })
      .subscribe();

    return () => {
      clearInterval(heartbeat);
      clearInterval(poller);
      supabase.removeChannel(generalChannel);
      supabase.removeChannel(redirectChannel);
      supabase.removeChannel(bcastChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  // ─── 2. GLOBAL LOBBY BROADCAST CHAT ────────────────────────────────────────
  useEffect(() => {
    const chatChannel = supabase.channel('global-lobby-chat', {
      config: { broadcast: { self: true } }
    });

    chatChannel
      .on('broadcast', { event: 'chat' }, (payload) => {
        const payloadData = payload.payload as ChatMessage;
        setChatMessages((prev) => [...prev.slice(-99), payloadData]);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          chatChannelRef.current = chatChannel;
        }
      });

    return () => {
      supabase.removeChannel(chatChannel);
      chatChannelRef.current = null;
    };
  }, []);

  // Scroll to chat bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim() || !chatChannelRef.current) return;

    chatChannelRef.current.send({
      type: 'broadcast',
      event: 'chat',
      payload: {
        username: player.username,
        text: msgInput.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    });

    setMsgInput('');
  };

  const handleAccept = async (c: Challenge) => {
    try {
      const data = await acceptChallenge(c.id, profileId, c.challenger_username || 'Opponent', player.username);
      if (data.game_id) {
        onGameStart(data.game_id);
      }
    } catch (err) {
      console.error('Accept error:', err);
    }
  };

  const handleReject = async (c: Challenge) => {
    try {
      await rejectChallenge(c.id);
      refreshData();
    } catch (err) {
      console.error('Decline error:', err);
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 p-4 lg:p-8 flex flex-col items-center relative antialiased text-slate-100 overflow-y-auto custom-scrollbar">
      
      {/* Decorative radial glows */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-violet-600/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-cyan-600/5 rounded-full blur-3xl pointer-events-none"></div>

      {notification && (
        <div className="fixed top-6 right-6 bg-emerald-600/90 border border-emerald-500/50 backdrop-blur-md text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce z-50">
          <Check className="w-5 h-5" />
          <span className="font-bold text-sm">{notification}</span>
        </div>
      )}

      {/* Header */}
      <div className="w-full max-w-6xl flex justify-between items-center mb-8 mt-2 z-10">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Chess <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">King</span>
          </h1>
          <p className="text-slate-400 text-xs mt-1">Play real-time chess matches on a premium platform.</p>
        </div>
        <div className="flex items-center gap-3">
          {onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="flex items-center gap-2 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800 hover:border-violet-500/50 rounded-xl px-3.5 py-2.5 transition-all duration-200 text-slate-300 hover:text-white group"
              title="Admin Panel"
            >
              <Shield size={16} className="text-violet-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-semibold hidden sm:inline">Admin</span>
            </button>
          )}
          <div 
            onClick={() => onViewProfile(player.username)} 
            className="flex items-center gap-3 cursor-pointer group bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2.5 transition-all duration-200"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-sm font-bold text-white uppercase shadow-md shadow-violet-600/10">
              {player.username.charAt(0)}
            </div>
            <div>
              <div className="text-xs font-bold text-white group-hover:text-violet-400 transition-colors">@{player.username}</div>
              <div className="text-[10px] text-slate-500">View Profile</div>
            </div>
          </div>
          <NavDrawer
            player={player}
            profileId={profileId}
            onViewProfile={onViewProfile}
            onSelectOfflineDual={onSelectOfflineDual}
            onOpenAdmin={onOpenAdmin}
          />
        </div>
      </div>

      {/* Global Broadcast Announcement Banner */}
      {broadcastMessage && (
        <div className="w-full max-w-6xl mb-4 bg-gradient-to-r from-amber-500/20 via-amber-600/20 to-amber-500/20 border border-amber-500/40 rounded-2xl p-4 flex items-center justify-between shadow-xl backdrop-blur-md z-10 animate-pulse">
          <div className="flex items-center gap-3">
            <Megaphone className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="text-[10px] font-bold tracking-widest uppercase text-amber-400 block">System Announcement</span>
              <p className="text-xs font-semibold text-white">{broadcastMessage}</p>
            </div>
          </div>
          <button onClick={() => setBroadcastMessage(null)} className="text-slate-400 hover:text-white p-1">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Two-Column Dashboard */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6 z-10 items-start">
        
        {/* LEFT COLUMN: Matchmaking CTA Cards, Pending Invites, Spectating list */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Quick Match Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Quick Play Card */}
            <div className="relative group overflow-hidden bg-slate-900/60 border border-slate-800/80 hover:border-violet-500/40 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 shadow-xl">
              <div className="absolute -right-8 -top-8 w-24 h-24 bg-violet-600/10 rounded-full blur-xl group-hover:bg-violet-600/20 transition-all"></div>
              <h3 className="text-lg font-bold text-white mb-1.5 flex items-center gap-2">
                <Play className="w-5 h-5 text-violet-400" />
                Quick Play
              </h3>
              <p className="text-slate-400 text-xs leading-relaxed mb-6">
                Queue up to match with an active opponent instantly. Choose standard time increments or custom formats.
              </p>
              <button
                onClick={() => onCreateChallenge('open')}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl transition-all duration-300 shadow-md shadow-violet-600/10 text-xs flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Plus size={14} />
                <span>Play Quick Match</span>
              </button>
            </div>

            {/* Challenge Friend Card */}
            <div className="relative group overflow-hidden bg-slate-900/60 border border-slate-800/80 hover:border-cyan-500/40 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 shadow-xl">
              <div className="absolute -right-8 -top-8 w-24 h-24 bg-cyan-600/10 rounded-full blur-xl group-hover:bg-cyan-600/20 transition-all"></div>
              <h3 className="text-lg font-bold text-white mb-1.5 flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                Challenge Friend
              </h3>
              <p className="text-slate-400 text-xs leading-relaxed mb-6">
                Type in a player's handle directly. Best suited for private games, custom controls, and friendly matches.
              </p>
              <button
                onClick={() => onCreateChallenge('direct')}
                className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold py-2.5 px-4 rounded-xl transition-all duration-300 shadow-md shadow-cyan-600/10 text-xs flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Send size={12} />
                <span>Invite Player</span>
              </button>
            </div>

          </div>

          {/* Pending Invitations list */}
          {pendingChallenges.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                Match Invitations
              </h3>
              <div className="space-y-3">
                {pendingChallenges.map((c) => (
                  <div key={c.id} className="flex justify-between items-center p-3.5 bg-slate-950/50 border border-slate-850 rounded-xl">
                    <span className="text-sm font-medium text-slate-200">
                      Challenge from <strong className="text-white">@{c.challenger_username}</strong>
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAccept(c)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1 shadow-lg shadow-emerald-950/20"
                      >
                        <Check size={14} /> Accept
                      </button>
                      <button
                        onClick={() => handleReject(c)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1 border border-slate-750"
                      >
                        <X size={14} /> Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ongoing Battles spectate queue */}
          <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Ongoing Battles
            </h3>
            <div className="space-y-3">
              {activeMatches.length === 0 ? (
                <p className="text-slate-500 text-xs italic py-4 text-center font-mono">No live chess battles in progress.</p>
              ) : (
                activeMatches.map((m) => (
                  <div key={m.game_id} className="flex justify-between items-center p-3.5 bg-slate-950/50 border border-slate-850 rounded-xl transition-all hover:bg-slate-950/80">
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                      <div className="text-xs font-medium text-slate-300">
                        <strong className="text-white text-sm">@{m.white_player}</strong>
                        <span className="mx-2 text-slate-500 font-bold">vs</span>
                        <strong className="text-white text-sm">@{m.black_player}</strong>
                      </div>
                    </div>
                    <button
                      onClick={() => onGameStart(m.game_id)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 active:scale-95"
                    >
                      <Eye size={14} className="text-cyan-400" />
                      Spectate
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Online Players Sidebar & Global Chat */}
        <div className="space-y-6 lg:sticky lg:top-4 self-start">
          
          {/* Online Players */}
          <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col h-[300px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex justify-between items-center">
              <span>Online Players</span>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                {onlinePlayers.length} Active
              </span>
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {onlinePlayers.length === 0 ? (
                <p className="text-slate-600 text-xs italic text-center py-12 font-mono">No other players online.</p>
              ) : (
                onlinePlayers.map((p) => (
                  <div key={p.id} className="flex justify-between items-center p-2.5 bg-slate-950/30 hover:bg-slate-950/60 rounded-xl border border-slate-850/50">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-bold text-slate-200">@{p.username}</span>
                    </div>
                    <button
                      onClick={() => onCreateChallenge('direct', p.username)}
                      className="text-[10px] font-bold text-violet-400 hover:text-white border border-violet-500/30 hover:bg-violet-600/30 px-2.5 py-1.5 rounded-lg transition-all"
                    >
                      Challenge
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Global Chat Widget */}
          <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col h-[340px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
              <MessageSquare size={14} className="text-violet-400" />
              Lobby Chat Room
            </h3>

            {/* Scrollable messages container */}
            <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-slate-950/40 rounded-xl border border-slate-850/50 mb-3 custom-scrollbar">
              {chatMessages.length === 0 ? (
                <div className="text-center text-slate-600 text-xs py-12 font-mono italic">
                  No messages yet.<br />Say hello to the lobby!
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} className="text-xs flex flex-col">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-bold text-violet-400">@{msg.username}</span>
                      <span className="text-[9px] text-slate-600 font-mono">{msg.timestamp}</span>
                    </div>
                    <p className="text-slate-300 mt-0.5 leading-relaxed break-all select-text">{msg.text}</p>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input form */}
            <form onSubmit={sendChatMessage} className="flex gap-2">
              <input
                type="text"
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                placeholder="Send message to lobby..."
                className="flex-1 bg-slate-950/60 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-violet-500 transition-colors"
              />
              <button
                type="submit"
                disabled={!msgInput.trim()}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition-all shadow-md shadow-violet-600/10 active:scale-95"
              >
                <Send size={12} />
              </button>
            </form>
          </div>

        </div>

      </div>

    </div>
  );
}