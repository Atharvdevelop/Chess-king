import { useState, useEffect } from 'react';
import { Player, Challenge } from '../types/chess';
import {
  getAvailablePlayers,
  getPendingChallenges,
  createChallenge,
  acceptChallenge,
  rejectChallenge,
  subscribeToChallenges,
  updateHeartbeat
} from '../lib/gamesService';
import { supabase } from '../lib/supabase';
import { Users, MessageCircle, Check, X } from 'lucide-react';

export default function GameLobby({ player }: { player: Player }) {
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [pendingChallenges, setPendingChallenges] = useState<Challenge[]>([]);
  const [selectedTab, setSelectedTab] = useState<'challenge' | 'pending'>('challenge');

  const refreshData = async () => {
    setAvailablePlayers(await getAvailablePlayers(player.id));
    setPendingChallenges(await getPendingChallenges(player.id));
  };

  useEffect(() => {
    refreshData();

    // 1. HEARTBEAT: Tell the DB we are alive every 10s
    const heartbeat = setInterval(() => updateHeartbeat(player.id), 10000);

    // 2. REFRESH: Clean up ghosts every 15s
    const poller = setInterval(refreshData, 15000);

    // 3. REALTIME: Listen for redirects
    const channel = subscribeToChallenges(player.id, (payload) => {
      if (payload.new?.status === 'accepted' && payload.new?.game_id) {
        // FORCE REDIRECT to the game page
        window.location.href = `/game/${payload.new.game_id}`;
      } else {
        refreshData();
      }
    });

    return () => {
      clearInterval(heartbeat);
      clearInterval(poller);
      supabase.removeChannel(channel);
    };
  }, [player.id]);

  const handleAccept = async (c: Challenge) => {
    const data = await acceptChallenge(c.id, player.id, c.challenger_username || 'Opponent', player.username);
    if (data.game_id) window.location.href = `/game/${data.game_id}`;
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 flex flex-col items-center">
      <h1 className="text-4xl font-bold text-white mb-8">Chess Multiplayer</h1>
      
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="flex border-b">
          <button onClick={() => setSelectedTab('challenge')} className={`flex-1 p-4 ${selectedTab === 'challenge' ? 'bg-blue-600 text-white' : ''}`}>Players</button>
          <button onClick={() => setSelectedTab('pending')} className={`flex-1 p-4 ${selectedTab === 'pending' ? 'bg-blue-600 text-white' : ''}`}>Challenges ({pendingChallenges.length})</button>
        </div>

        <div className="p-6">
          {selectedTab === 'challenge' ? (
            <div className="space-y-4">
              {availablePlayers.length === 0 && <p className="text-center text-gray-500">No active players online.</p>}
              {availablePlayers.map(p => (
                <div key={p.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium">{p.username}</span>
                  <button onClick={() => createChallenge(player.id, p.id)} className="bg-green-600 text-white px-4 py-1 rounded-md">Challenge</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {pendingChallenges.length === 0 && <p className="text-center text-gray-500">No pending requests.</p>}
              {pendingChallenges.map(c => (
                <div key={c.id} className="flex justify-between items-center p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <span><strong>{c.challenger_username}</strong> challenges you!</span>
                  <div className="flex gap-2">
                    <button onClick={() => handleAccept(c)} className="bg-green-600 text-white px-3 py-1 rounded">Accept</button>
                    <button onClick={() => rejectChallenge(c.id)} className="bg-red-600 text-white px-3 py-1 rounded">Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}