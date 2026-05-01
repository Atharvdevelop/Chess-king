import { useState, useEffect } from 'react';
import { Player, Challenge } from '../types/chess';
import {
  getAvailablePlayers,
  getPendingChallenges,
  createChallenge,
  acceptChallenge,
  rejectChallenge,
  subscribeToChallenges
} from '../lib/gamesService';
import { supabase } from '../lib/supabase';
import { Users, MessageCircle, Check, X } from 'lucide-react';

export default function GameLobby({ player }: { player: Player }) {
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [pendingChallenges, setPendingChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'challenge' | 'pending'>('challenge');

  useEffect(() => {
    loadAvailablePlayers();
    loadPendingChallenges();

    // The Challenger's "Automatic Redirect" logic
    const channel = subscribeToChallenges(player.id, (payload) => {
      console.log('📡 Lobby Signal:', payload);

      if (payload.new && payload.new.status === 'accepted' && payload.new.game_id) {
        console.log('🚀 Game Found! Redirecting...');
        // This physically moves the browser to the new page
        window.location.href = `/game/${payload.new.game_id}`;
      } else {
        loadAvailablePlayers();
        loadPendingChallenges();
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [player.id]);

  const loadAvailablePlayers = async () => {
    const players = await getAvailablePlayers(player.id);
    setAvailablePlayers(players);
  };

  const loadPendingChallenges = async () => {
    const challenges = await getPendingChallenges(player.id);
    setPendingChallenges(challenges);
  };

  const handleSendChallenge = async (targetId: string) => {
    setLoading(true);
    try {
      await createChallenge(player.id, targetId);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleAcceptChallenge = async (challengeId: string, challengerName: string) => {
    setLoading(true);
    try {
      const challenge = await acceptChallenge(challengeId, player.id, challengerName, player.username);
      if (challenge.game_id) {
        // Opponent redirects here
        window.location.href = `/game/${challenge.game_id}`;
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleRejectChallenge = async (id: string) => {
    await rejectChallenge(id);
    loadPendingChallenges();
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden p-8">
        <h1 className="text-3xl font-bold text-center mb-6">Chess Lobby</h1>
        <div className="flex gap-4 mb-6">
            <button onClick={() => setSelectedTab('challenge')} className={`flex-1 p-2 ${selectedTab === 'challenge' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Players</button>
            <button onClick={() => setSelectedTab('pending')} className={`flex-1 p-2 ${selectedTab === 'pending' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Challenges ({pendingChallenges.length})</button>
        </div>

        {selectedTab === 'challenge' ? (
          <div className="grid gap-4">
            {availablePlayers.map(p => (
              <div key={p.id} className="flex justify-between p-4 bg-slate-50 rounded-lg">
                <span>{p.username}</span>
                <button onClick={() => handleSendChallenge(p.id)} disabled={loading} className="bg-green-600 text-white px-4 py-1 rounded">Challenge</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4">
            {pendingChallenges.map(c => (
              <div key={c.id} className="flex justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <span>{c.challenger_username} challenges you!</span>
                <div className="flex gap-2">
                  <button onClick={() => handleAcceptChallenge(c.id, c.challenger_username || '')} className="bg-green-600 text-white px-4 py-1 rounded">Accept</button>
                  <button onClick={() => handleRejectChallenge(c.id)} className="bg-red-600 text-white px-4 py-1 rounded">Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}