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

interface GameLobbyProps {
  player: Player;
  onGameStart: (gameId: string) => void;
}

export default function GameLobby({ player, onGameStart }: GameLobbyProps) {
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [pendingChallenges, setPendingChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'challenge' | 'pending'>('challenge');

  useEffect(() => {
    loadAvailablePlayers();
    loadPendingChallenges();

    // REALTIME SYNC: The Challenger's "Ear"
    const channel = subscribeToChallenges(player.id, (payload) => {
      console.log('📡 REALTIME SIGNAL:', payload.eventType, payload.new);

      // Check specifically for an UPDATE where status becomes 'accepted'
      const isAccepted = payload.new?.status === 'accepted';
      const gameId = payload.new?.game_id;

      if (isAccepted && gameId) {
        console.log('🚀 MATCH FOUND! Diverting to Game:', gameId);
        onGameStart(gameId);
      } else {
        // Just a normal update (new challenge, etc.), refresh the lists
        loadAvailablePlayers();
        loadPendingChallenges();
      }
    });

    const refreshInterval = setInterval(() => {
      loadAvailablePlayers();
      loadPendingChallenges();
    }, 15000); 

    return () => {
      clearInterval(refreshInterval);
      supabase.removeChannel(channel);
    };
  }, [player.id, onGameStart]);

  const loadAvailablePlayers = async () => {
    try {
      const players = await getAvailablePlayers(player.id);
      setAvailablePlayers(players);
    } catch (error) {
      console.error('Error loading players:', error);
    }
  };

  const loadPendingChallenges = async () => {
    try {
      const challenges = await getPendingChallenges(player.id);
      setPendingChallenges(challenges);
    } catch (error) {
      console.error('Error loading challenges:', error);
    }
  };

  const handleSendChallenge = async (targetPlayerId: string) => {
    setLoading(true);
    try {
      await createChallenge(player.id, targetPlayerId);
      await loadAvailablePlayers();
    } catch (error) {
      console.error('Error sending challenge:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptChallenge = async (challengeId: string, challengerUsername: string) => {
    setLoading(true);
    try {
      const challenge = await acceptChallenge(challengeId, player.id, challengerUsername, player.username);
      if (challenge.game_id) {
        onGameStart(challenge.game_id);
      }
    } catch (error) {
      console.error('Error accepting challenge:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectChallenge = async (challengeId: string) => {
    setLoading(true);
    try {
      await rejectChallenge(challengeId);
      await loadPendingChallenges();
    } catch (error) {
      console.error('Error rejecting challenge:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Users className="w-12 h-12" />
            Chess Multiplayer
          </h1>
          <p className="text-slate-300 text-lg">Welcome, <span className="font-semibold text-blue-400">{player.username}</span>!</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setSelectedTab('challenge')}
              className={`flex-1 py-4 px-6 font-semibold transition-colors ${
                selectedTab === 'challenge'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <MessageCircle className="w-4 h-4 inline mr-2" />
              Challenge Players
            </button>
            <button
              onClick={() => setSelectedTab('pending')}
              className={`flex-1 py-4 px-6 font-semibold transition-colors relative ${
                selectedTab === 'pending'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Challenges
              {pendingChallenges.length > 0 && (
                <span className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                  {pendingChallenges.length}
                </span>
              )}
            </button>
          </div>

          <div className="p-8">
            {selectedTab === 'challenge' ? (
              <div>
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Available Players</h2>
                {availablePlayers.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg">No players available at the moment.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {availablePlayers.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors border border-slate-200"
                      >
                        <div>
                          <p className="font-semibold text-slate-800">{p.username}</p>
                          <p className="text-xs text-slate-500">Ready to play</p>
                        </div>
                        <button
                          onClick={() => handleSendChallenge(p.id)}
                          disabled={loading}
                          className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center gap-2"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Challenge
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Challenge Requests</h2>
                {pendingChallenges.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg">No pending challenges.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingChallenges.map((challenge) => (
                      <div
                        key={challenge.id}
                        className="flex items-center justify-between p-4 bg-amber-50 border-2 border-amber-200 rounded-xl hover:bg-amber-100 transition-colors"
                      >
                        <div>
                          <p className="font-bold text-slate-800 text-lg">
                            {challenge.challenger_username} challenges you!
                          </p>
                          <p className="text-sm text-slate-600">10 min + 0s blitz</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcceptChallenge(challenge.id, challenge.challenger_username || 'Unknown')}
                            disabled={loading}
                            className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center gap-2"
                          >
                            <Check className="w-4 h-4" />
                            Accept
                          </button>
                          <button
                            onClick={() => handleRejectChallenge(challenge.id)}
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center gap-2"
                          >
                            <X className="w-4 h-4" />
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}