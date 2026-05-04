import { useState, useEffect } from 'react';
import { Player, Challenge } from '../types/chess';
import {
  getLobbyPlayers,
  getPendingChallenges,
  createChallenge,
  acceptChallenge,
  rejectChallenge,
  subscribeToChallenges,
  subscribeToChallengeAccepted,
  updateHeartbeat,
  getAllMembers,
  getActiveMatches
} from '../lib/gameService'; // FIXED: Singular to match your file
import { supabase } from '../lib/supabase';
import { Users, MessageCircle, Check, X, Eye, Activity, Globe } from 'lucide-react';

// Added onGameStart to the props destructuring
export default function GameLobby({ player, onGameStart }: { player: Player, onGameStart: (id: string) => void }) {
  // Main Navigation State
  const [mainTab, setMainTab] = useState<'lobby' | 'members' | 'playing'>('lobby');
  const [lobbyTab, setLobbyTab] = useState<'challenge' | 'pending'>('challenge');

  // Data States
  const [lobbyPlayers, setLobbyPlayers] = useState<Player[]>([]);
  const [members, setMembers] = useState<Player[]>([]);
  const [activeMatches, setActiveMatches] = useState<{ game_id: string; white_player: string; black_player: string; status?: string }[]>([]);
  const [pendingChallenges, setPendingChallenges] = useState<Challenge[]>([]);
  
  // Notification State for the "Accepted" popup
  const [notification, setNotification] = useState<string | null>(null);

  const refreshData = async () => {
    try {
      const players = await getLobbyPlayers(player.id);
      setLobbyPlayers(players);
      
      const challenges = await getPendingChallenges(player.id);
      setPendingChallenges(challenges);
      
      if (mainTab === 'members') setMembers(await getAllMembers());
      if (mainTab === 'playing') setActiveMatches(await getActiveMatches());
    } catch (err) {
      console.error("Refresh error:", err);
    }
  };

  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab]);

  useEffect(() => {
    refreshData();

    // 1. HEARTBEAT: Keep the player 'online'
    const heartbeat = setInterval(() => updateHeartbeat(player.id), 10000);

    // 2. REFRESH: Auto-update lobby every 15s to remove ghosts
    const poller = setInterval(refreshData, 15000);

    // 3. REALTIME: Listen for challenges or list refreshes
    const generalChannel = subscribeToChallenges(player.id, () => {
      refreshData();
    });

    // 4. REALTIME (Redirect): The "Nuclear Fix" for the Challenger
    const redirectChannel = subscribeToChallengeAccepted(player.id, (gameId, opponentName) => {
      setNotification(`🎉 ${opponentName} accepted! Transporting to match...`);
      
      setTimeout(() => {
        // This triggers the App.tsx URL detector
        onGameStart(gameId);
      }, 2000);
    });

    return () => {
      clearInterval(heartbeat);
      clearInterval(poller);
      supabase.removeChannel(generalChannel);
      supabase.removeChannel(redirectChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id]);

  const handleAccept = async (c: Challenge) => {
    try {
      const data = await acceptChallenge(c.id, player.id, c.challenger_username || 'Opponent', player.username);
      if (data.game_id) {
        // Transport the acceptor immediately
        onGameStart(data.game_id);
      }
    } catch (err) {
      console.error("Accept error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 flex flex-col items-center relative">
      
      {notification && (
        <div className="absolute top-10 right-10 bg-green-500 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-bounce z-50 border-2 border-white">
          <Check className="w-6 h-6" />
          <span className="font-bold text-lg">{notification}</span>
        </div>
      )}

      <h1 className="text-4xl font-bold text-white mb-8 mt-4 tracking-wider">CHESS-KING</h1>
      
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl overflow-hidden">
        
        <div className="flex bg-slate-800 text-slate-300">
          <button 
            onClick={() => setMainTab('lobby')} 
            className={`flex-1 p-4 flex items-center justify-center gap-2 transition-colors ${mainTab === 'lobby' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-700'}`}
          >
            <Users className="w-5 h-5" /> Lobby
          </button>
          <button 
            onClick={() => setMainTab('members')} 
            className={`flex-1 p-4 flex items-center justify-center gap-2 transition-colors ${mainTab === 'members' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-700'}`}
          >
            <Globe className="w-5 h-5" /> Members
          </button>
          <button 
            onClick={() => setMainTab('playing')} 
            className={`flex-1 p-4 flex items-center justify-center gap-2 transition-colors ${mainTab === 'playing' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-700'}`}
          >
            <Activity className="w-5 h-5" /> Playing
          </button>
        </div>

        <div className="p-6 min-h-[400px]">
          
          {mainTab === 'lobby' && (
            <div>
              <div className="flex border-b mb-4">
                <button onClick={() => setLobbyTab('challenge')} className={`flex-1 pb-3 ${lobbyTab === 'challenge' ? 'border-b-4 border-blue-600 font-bold text-blue-600' : 'text-gray-500'}`}>
                  Online
                </button>
                <button onClick={() => setLobbyTab('pending')} className={`flex-1 pb-3 relative ${lobbyTab === 'pending' ? 'border-b-4 border-blue-600 font-bold text-blue-600' : 'text-gray-500'}`}>
                  Requests
                  {pendingChallenges.length > 0 && (
                    <span className="absolute top-0 right-4 bg-red-500 text-white text-xs px-2 py-1 rounded-full">{pendingChallenges.length}</span>
                  )}
                </button>
              </div>

              {lobbyTab === 'challenge' ? (
                <div className="space-y-3">
                  {lobbyPlayers.length === 0 && <p className="text-center text-gray-400 mt-10 italic">No free players online.</p>}
                  {lobbyPlayers.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="font-bold text-slate-700 text-lg">{p.username}</span>
                      </div>
                      <button onClick={() => createChallenge(player.id, p.id)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md transition flex items-center gap-2 shadow-sm">
                        <MessageCircle className="w-4 h-4"/> Challenge
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingChallenges.length === 0 && <p className="text-center text-gray-400 mt-10 italic">No incoming challenges.</p>}
                  {pendingChallenges.map(c => (
                    <div key={c.id} className="flex justify-between items-center p-4 bg-amber-50 rounded-lg border border-amber-300">
                      <span><strong className="text-lg">{c.challenger_username}</strong> challenges you!</span>
                      <div className="flex gap-2">
                        <button onClick={() => handleAccept(c)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex items-center gap-2 shadow-sm">
                          <Check className="w-4 h-4"/> Accept
                        </button>
                        <button onClick={() => rejectChallenge(c.id)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded flex items-center gap-2 shadow-sm">
                          <X className="w-4 h-4"/> Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {mainTab === 'members' && (
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-slate-800 mb-4">Total Members</h2>
              <div className="grid grid-cols-2 gap-4">
                {members.map(m => (
                  <div key={m.id} className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-3">
                    <Users className="text-slate-400 w-5 h-5" />
                    <span className="font-semibold text-slate-700">{m.username}</span>
                    {m.status === 'busy' && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded">In Game</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mainTab === 'playing' && (
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-slate-800 mb-4">Live Matches</h2>
              {activeMatches.length === 0 && <p className="text-center text-gray-400 mt-10 italic">No matches in progress.</p>}
              {activeMatches.map(m => (
                <div key={m.game_id} className="flex justify-between items-center p-5 bg-gradient-to-r from-slate-800 to-slate-700 rounded-lg text-white shadow-lg border border-slate-600">
                  <div className="flex items-center gap-4 text-lg">
                    <span className="font-bold text-blue-300">{m.white_player}</span> 
                    <span className="text-slate-400 text-sm">vs</span> 
                    <span className="font-bold text-red-300">{m.black_player}</span>
                  </div>
                  <button 
                    onClick={() => window.location.href = `/game/${m.game_id}?mode=spectate`}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-md transition flex items-center gap-2 shadow-md"
                  >
                    <Eye className="w-4 h-4" /> Spectate
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}