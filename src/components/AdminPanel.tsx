import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import ChessBoard from './ChessBoard';
import { createInitialBoard } from '../lib/chessLogic';
import {
  Shield, ArrowLeft, Users, Key, Eye, EyeOff,
  CheckCircle, XCircle, Loader2, Search, RefreshCw,
  Lock, Ban, UserCheck, Trash2, Megaphone, Flag,
  Radio, Award, Swords, Activity, AlertTriangle, Play
} from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  username: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_banned: boolean;
  rating: number;
  bio: string;
}

interface MatchHistoryItem {
  id: string;
  opponent: string;
  color: 'white' | 'black';
  result: string;
  time_format: string;
  created_at: string;
  status: string;
}

interface ReportItem {
  id: string;
  reporter_name: string;
  reported_id: string;
  reported_name: string;
  game_id?: string;
  reason: string;
  details?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
}

interface PlatformStats {
  totalUsers: number;
  onlinePlayers: number;
  totalGames: number;
  activeGames: number;
  bannedCount: number;
  pendingReports: number;
}

interface AdminPanelProps {
  onBack: () => void;
}

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-panel`;

export default function AdminPanel({ onBack }: AdminPanelProps) {
  // ── Auth gate ──────────────────────────────────────────────────────────────
  const [adminSecret, setAdminSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [checkingInitialAuth, setCheckingInitialAuth] = useState(true);

  // ── Active Tab ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'users' | 'spectate' | 'reports' | 'broadcast'>('users');

  // ── Data States ────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'banned'>('all');

  // ── Selected User Inspector ────────────────────────────────────────────────
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userDetailsLoading, setUserDetailsLoading] = useState(false);
  const [userStats, setUserStats] = useState<{ totalGames: number; wins: number; losses: number; draws: number; winRate: number } | null>(null);
  const [userMatches, setUserMatches] = useState<MatchHistoryItem[]>([]);
  const [editRating, setEditRating] = useState(1200);

  // ── Password Reset State ───────────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Live Games State ───────────────────────────────────────────────────────
  const [liveGames, setLiveGames] = useState<any[]>([]);
  const [spectatingGame, setSpectatingGame] = useState<any | null>(null);

  // ── Reports State ──────────────────────────────────────────────────────────
  const [reports, setReports] = useState<ReportItem[]>([]);

  // ── Broadcast State ────────────────────────────────────────────────────────
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastSent, setBroadcastSent] = useState(false);

  // ── Call Edge Function (JWT Bearer + Secret Fallback) ───────────────────────
  const callAdmin = useCallback(async (body: object, overrideSecret?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const secretToUse = overrideSecret !== undefined ? overrideSecret : adminSecret;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (secretToUse) {
      headers['x-admin-secret'] = secretToUse;
    }

    let res: Response;
    try {
      res = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      throw new Error(`Network error connecting to Edge Function: ${err.message}`);
    }

    if (res.status === 404) {
      throw new Error('Edge Function not deployed yet. Please run: npx supabase functions deploy admin-panel');
    }

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || `HTTP ${res.status}`);
    }
    return json;
  }, [adminSecret]);

  // ── Fetch Dashboard Data ───────────────────────────────────────────────────
  const fetchDashboardData = useCallback(async (overrideSecret?: string) => {
    setUsersLoading(true);
    try {
      // 1. Fetch Users
      const userRes = await callAdmin({ action: 'list_users' }, overrideSecret);
      setUsers(userRes.users || []);

      // 2. Fetch Stats
      const statsRes = await callAdmin({ action: 'get_platform_stats' }, overrideSecret);
      setStats(statsRes.stats || null);

      // 3. Fetch Live Games
      const gamesRes = await callAdmin({ action: 'get_live_games' }, overrideSecret);
      setLiveGames(gamesRes.games || []);

      // 4. Fetch Reports
      const reportsRes = await callAdmin({ action: 'get_reports' }, overrideSecret);
      setReports(reportsRes.reports || []);
    } catch (err: any) {
      setActionNotice({ type: 'error', msg: err.message });
      throw err;
    } finally {
      setUsersLoading(false);
    }
  }, [callAdmin]);

  // ── Auto-Authenticate via User JWT on Mount ────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    const tryJwtAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await callAdmin({ action: 'check_admin' });
          if (isMounted) {
            setAuthenticated(true);
            fetchDashboardData();
          }
        }
      } catch {
        // Not recognized as admin via JWT alone; stay on login screen for secret entry
      } finally {
        if (isMounted) {
          setCheckingInitialAuth(false);
        }
      }
    };

    tryJwtAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // ── Handle Manual Login Submit ─────────────────────────────────────────────
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSecret.trim() || authLoading) return;
    setAuthLoading(true);
    setAuthError('');

    try {
      await fetchDashboardData(adminSecret);
      setAuthenticated(true);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Fetch Individual Player Details ───────────────────────────────────────
  const handleSelectUser = async (user: AdminUser) => {
    setSelectedUser(user);
    setEditRating(user.rating ?? 1200);
    setUserDetailsLoading(true);
    setActionNotice(null);

    try {
      const res = await callAdmin({ action: 'get_user_details', userId: user.id });
      setUserStats(res.stats || null);
      setUserMatches(res.matches || []);
    } catch (err: any) {
      setActionNotice({ type: 'error', msg: err.message });
    } finally {
      setUserDetailsLoading(false);
    }
  };

  // ── Ban / Unban User ───────────────────────────────────────────────────────
  const handleToggleBan = async (user: AdminUser) => {
    const action = user.is_banned ? 'unban_user' : 'ban_user';
    setActionNotice(null);

    try {
      await callAdmin({ action, userId: user.id });
      setActionNotice({ type: 'success', msg: `User @${user.username} ${user.is_banned ? 'unbanned' : 'banned'} successfully.` });
      
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_banned: !user.is_banned } : u));
      if (selectedUser?.id === user.id) {
        setSelectedUser(prev => prev ? { ...prev, is_banned: !prev.is_banned } : null);
      }
      fetchDashboardData();
    } catch (err: any) {
      setActionNotice({ type: 'error', msg: err.message });
    }
  };

  // ── Update Rating / Stats ──────────────────────────────────────────────────
  const handleUpdateRating = async () => {
    if (!selectedUser) return;
    try {
      await callAdmin({ action: 'update_user_stats', userId: selectedUser.id, rating: editRating });
      setActionNotice({ type: 'success', msg: `Rating for @${selectedUser.username} set to ${editRating}.` });
      setSelectedUser(prev => prev ? { ...prev, rating: editRating } : null);
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, rating: editRating } : u));
    } catch (err: any) {
      setActionNotice({ type: 'error', msg: err.message });
    }
  };

  // ── Change Password ────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!selectedUser || !newPassword) return;
    setChangingPw(true);
    setActionNotice(null);

    try {
      await callAdmin({ action: 'change_password', userId: selectedUser.id, newPassword });
      setActionNotice({ type: 'success', msg: `Password updated for @${selectedUser.username}.` });
      setNewPassword('');
    } catch (err: any) {
      setActionNotice({ type: 'error', msg: err.message });
    } finally {
      setChangingPw(false);
    }
  };

  // ── Delete User ────────────────────────────────────────────────────────────
  const handleDeleteUser = async (user: AdminUser) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete account @${user.username}?`)) return;
    try {
      await callAdmin({ action: 'delete_user', userId: user.id });
      setActionNotice({ type: 'success', msg: `User @${user.username} deleted.` });
      setSelectedUser(null);
      fetchDashboardData();
    } catch (err: any) {
      setActionNotice({ type: 'error', msg: err.message });
    }
  };

  // ── Update Report Status ───────────────────────────────────────────────────
  const handleUpdateReport = async (reportId: string, status: 'resolved' | 'dismissed') => {
    try {
      await callAdmin({ action: 'update_report', reportId, status });
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status } : r));
    } catch (err: any) {
      setActionNotice({ type: 'error', msg: err.message });
    }
  };

  // ── Force End / Abort Game ────────────────────────────────────────────────
  const handleForceEndGame = async (gameId: string, outcome: '1-0' | '0-1' | '1/2-1/2' | 'abort') => {
    try {
      await callAdmin({ action: 'force_end_game', gameId, outcome });
      setActionNotice({ type: 'success', msg: `Match resolved with outcome ${outcome}.` });
      setSpectatingGame(null);
      fetchDashboardData();
    } catch (err: any) {
      setActionNotice({ type: 'error', msg: err.message });
    }
  };

  // ── Send Global System Broadcast ──────────────────────────────────────────
  const handleSendBroadcast = async () => {
    if (!broadcastText.trim()) return;
    try {
      const channel = supabase.channel('global-announcements');
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'announcement',
        payload: { message: broadcastText },
      });
      setBroadcastSent(true);
      setTimeout(() => setBroadcastSent(false), 4000);
      setBroadcastText('');
    } catch (err: any) {
      setActionNotice({ type: 'error', msg: err.message });
    }
  };

  // Filtered Users List
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    if (filterMode === 'active') return matchSearch && !u.is_banned;
    if (filterMode === 'banned') return matchSearch && u.is_banned;
    return matchSearch;
  });

  // ── INITIAL AUTH VERIFICATION ──────────────────────────────────────────────
  if (checkingInitialAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 antialiased">
        <div className="w-12 h-12 rounded-2xl bg-violet-600/10 border border-violet-500/30 text-violet-400 flex items-center justify-center mb-4 shadow-lg shadow-violet-600/10 animate-pulse">
          <Shield size={24} />
        </div>
        <p className="text-xs font-bold text-slate-400 font-mono flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-violet-400" /> Verifying Admin Authorization...
        </p>
      </div>
    );
  }

  // ── LOGIN SCREEN ──────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 antialiased">
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
          
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-violet-600/10 border border-violet-500/30 text-violet-400 flex items-center justify-center mb-4 shadow-lg shadow-violet-600/10">
              <Shield size={28} />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Admin Suite</h1>
            <p className="text-slate-400 text-xs mt-1">Enter platform secret to access control panel.</p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Admin Secret</label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={adminSecret}
                  onChange={e => setAdminSecret(e.target.value)}
                  placeholder="Enter CHESS_KING_ADMIN_SECRET..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-violet-500 pr-10 font-mono"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-300"
                >
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                <XCircle size={16} className="shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-violet-600/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {authLoading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
              <span>Enter Admin Panel</span>
            </button>
          </form>

          <button
            onClick={onBack}
            className="w-full mt-4 text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors py-2 flex items-center justify-center gap-1.5"
          >
            <ArrowLeft size={14} /> Back to Website
          </button>
        </div>
      </div>
    );
  }

  // ── MAIN ADMIN DASHBOARD ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-8 antialiased">
      
      {/* Top Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-600/10 border border-violet-500/30 text-violet-400">
              <Shield size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">Admin Control Suite</h1>
              <p className="text-xs text-slate-400">Full system metrics, player moderation, and live server controls.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboardData}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold transition-all"
          >
            <RefreshCw size={14} className={usersLoading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-bold transition-all"
          >
            <ArrowLeft size={14} /> Exit Admin
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* System Overview Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <AdminStatWidget label="Total Players" value={stats?.totalUsers ?? users.length} icon={<Users size={16} className="text-cyan-400" />} />
          <AdminStatWidget label="Online Lobby" value={stats?.onlinePlayers ?? 0} icon={<Activity size={16} className="text-emerald-400" />} />
          <AdminStatWidget label="Live Games" value={stats?.activeGames ?? liveGames.length} icon={<Swords size={16} className="text-amber-400" />} />
          <AdminStatWidget label="Matches Played" value={stats?.totalGames ?? 0} icon={<Award size={16} className="text-violet-400" />} />
          <AdminStatWidget label="Banned Users" value={stats?.bannedCount ?? users.filter(u => u.is_banned).length} icon={<Ban size={16} className="text-rose-400" />} />
          <AdminStatWidget label="Pending Reports" value={stats?.pendingReports ?? reports.filter(r => r.status === 'pending').length} icon={<Flag size={16} className="text-orange-400" />} />
        </div>

        {/* Global Action Notification */}
        {actionNotice && (
          <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-lg ${
            actionNotice.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}>
            <span className="flex items-center gap-2">
              {actionNotice.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
              {actionNotice.msg}
            </span>
            <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 gap-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 text-xs font-bold flex items-center gap-2 transition-colors relative ${
              activeTab === 'users' ? 'text-violet-400 border-b-2 border-violet-500' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users size={15} /> Users & Moderation ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('spectate')}
            className={`pb-3 text-xs font-bold flex items-center gap-2 transition-colors relative ${
              activeTab === 'spectate' ? 'text-violet-400 border-b-2 border-violet-500' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Eye size={15} /> Live Spectator ({liveGames.length})
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`pb-3 text-xs font-bold flex items-center gap-2 transition-colors relative ${
              activeTab === 'reports' ? 'text-violet-400 border-b-2 border-violet-500' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Flag size={15} /> Reports Queue ({reports.filter(r => r.status === 'pending').length})
          </button>
          <button
            onClick={() => setActiveTab('broadcast')}
            className={`pb-3 text-xs font-bold flex items-center gap-2 transition-colors relative ${
              activeTab === 'broadcast' ? 'text-violet-400 border-b-2 border-violet-500' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Megaphone size={15} /> Global Broadcast
          </button>
        </div>

        {/* TAB 1: USERS & MODERATION */}
        {activeTab === 'users' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left Column: Searchable User Table */}
            <div className="lg:col-span-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex gap-1.5 p-1 bg-slate-950 border border-slate-850 rounded-xl">
                {(['all', 'active', 'banned'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setFilterMode(mode)}
                    className={`flex-1 py-1 text-[10px] font-bold uppercase rounded-lg transition-all ${
                      filterMode === mode ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {/* User List */}
              <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
                {filteredUsers.length === 0 ? (
                  <p className="text-slate-600 text-xs py-8 text-center font-mono">No matching players found.</p>
                ) : (
                  filteredUsers.map(u => {
                    const isSelected = selectedUser?.id === u.id;
                    return (
                      <div
                        key={u.id}
                        onClick={() => handleSelectUser(u)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-violet-600/10 border-violet-500/50 shadow-md shadow-violet-600/10'
                            : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold flex items-center justify-center text-xs shrink-0">
                            {u.username[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white truncate">@{u.username}</span>
                              {u.is_banned && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                  BANNED
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">{u.email}</div>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono text-violet-400 font-bold shrink-0">
                          ⚡ {u.rating}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Player Inspector & Moderation Actions */}
            <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
              {!selectedUser ? (
                <div className="py-20 text-center text-slate-500 font-mono text-xs space-y-2">
                  <Shield className="w-8 h-8 mx-auto text-slate-700" />
                  <p>Select a player from the list to inspect profile, statistics, and manage account status.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Player Summary Header */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-800">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/30 to-indigo-900/30 border border-violet-500/40 text-violet-300 font-extrabold text-2xl flex items-center justify-center">
                        {selectedUser.username[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-black text-white">@{selectedUser.username}</h2>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            selectedUser.is_banned ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {selectedUser.is_banned ? 'SUSPENDED / BANNED' : 'ACTIVE'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedUser.email}</p>
                        <p className="text-[10px] text-slate-500 font-mono">UUID: {selectedUser.id}</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleBan(selectedUser)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                          selectedUser.is_banned
                            ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {selectedUser.is_banned ? <UserCheck size={14} /> : <Ban size={14} />}
                        <span>{selectedUser.is_banned ? 'Unban Player' : 'Ban Player'}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteUser(selectedUser)}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 text-xs font-bold"
                        title="Delete User"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Player Stats Grid & Rating Modifier */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Matches Played</span>
                      <div className="text-xl font-black text-white mt-1">{userStats?.totalGames ?? 0}</div>
                    </div>

                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Win / Loss / Draw</span>
                      <div className="text-xl font-black text-emerald-400 mt-1">
                        {userStats ? `${userStats.wins}W / ${userStats.losses}L / ${userStats.draws}D` : '—'}
                      </div>
                    </div>

                    {/* Manual ELO Modifier */}
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Modify Player ELO</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editRating}
                          onChange={e => setEditRating(Number(e.target.value))}
                          className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                        />
                        <button
                          onClick={handleUpdateRating}
                          className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Match History Log */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                      <Swords size={14} className="text-violet-400" /> Recent Match History
                    </h3>

                    {userDetailsLoading ? (
                      <div className="py-8 text-center text-slate-500 font-mono text-xs flex items-center justify-center gap-2">
                        <Loader2 size={16} className="animate-spin text-violet-400" /> Loading match records...
                      </div>
                    ) : userMatches.length === 0 ? (
                      <p className="text-slate-600 text-xs font-mono py-6 text-center bg-slate-950 border border-slate-850 rounded-xl">
                        No matches recorded for this player yet.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {userMatches.map(m => (
                          <div key={m.id} className="flex justify-between items-center p-2.5 bg-slate-950 border border-slate-850 rounded-xl text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                                m.result === 'WIN' ? 'bg-emerald-500/10 text-emerald-400' : m.result === 'LOSS' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
                              }`}>
                                {m.result}
                              </span>
                              <span className="font-semibold text-slate-200">vs @{m.opponent} ({m.color})</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500">{new Date(m.created_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Change Password Form */}
                  <div className="pt-4 border-t border-slate-800 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Key size={14} className="text-cyan-400" /> Reset User Password
                    </h3>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <input
                          type={showNewPw ? 'text' : 'password'}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="Enter new password..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPw(!showNewPw)}
                          className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                        >
                          {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button
                        onClick={handleChangePassword}
                        disabled={changingPw || !newPassword}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {changingPw ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                        Update Password
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: LIVE SPECTATOR */}
        {activeTab === 'spectate' && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-400" /> Live Match Spectator
            </h2>

            {spectatingGame ? (
              <div className="space-y-4">
                <button
                  onClick={() => setSpectatingGame(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold hover:text-white flex items-center gap-1.5"
                >
                  <ArrowLeft size={14} /> Back to Live List
                </button>

                <div className="flex flex-col items-center justify-center p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
                  <div className="text-xs text-slate-400 font-bold">
                    Spectating: <span className="text-white">@{spectatingGame.white_player_username || 'White'}</span> vs <span className="text-white">@{spectatingGame.black_player_username || 'Black'}</span>
                  </div>
                  <div className="w-[340px] h-[340px] border border-slate-800 rounded-lg overflow-hidden">
                    <ChessBoard
                      board={spectatingGame.board_state || createInitialBoard()}
                      currentTurn={spectatingGame.current_turn || 'white'}
                      playerColor="white"
                    />
                  </div>

                  {/* Admin Force Outcome Controls */}
                  <div className="pt-3 border-t border-slate-800 flex flex-wrap gap-2 justify-center">
                    <span className="w-full text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Admin Force Match Result</span>
                    <button onClick={() => handleForceEndGame(spectatingGame.id, '1-0')} className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold">1-0 (White Win)</button>
                    <button onClick={() => handleForceEndGame(spectatingGame.id, '0-1')} className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold">0-1 (Black Win)</button>
                    <button onClick={() => handleForceEndGame(spectatingGame.id, '1/2-1/2')} className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold">1/2-1/2 (Draw)</button>
                    <button onClick={() => handleForceEndGame(spectatingGame.id, 'abort')} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold">Abort Match</button>
                  </div>
                </div>
              </div>
            ) : liveGames.length === 0 ? (
              <div className="py-16 text-center text-slate-500 font-mono text-xs">
                No active games currently in progress.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveGames.map(g => (
                  <div key={g.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex justify-between items-center text-xs font-bold text-white">
                      <span>@{g.white_player_username || 'White'}</span>
                      <span className="text-slate-500 text-[10px]">VS</span>
                      <span>@{g.black_player_username || 'Black'}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
                      <span>Format: {g.time_format || '10+0'}</span>
                      <span className="text-emerald-400">● LIVE</span>
                    </div>
                    <button
                      onClick={() => setSpectatingGame(g)}
                      className="w-full py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Play size={14} /> Spectate Live
                    </button>
                    <div className="pt-2 flex flex-wrap gap-1 border-t border-slate-850">
                      <button onClick={() => handleForceEndGame(g.id, '1-0')} className="flex-1 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">1-0</button>
                      <button onClick={() => handleForceEndGame(g.id, '0-1')} className="flex-1 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold">0-1</button>
                      <button onClick={() => handleForceEndGame(g.id, '1/2-1/2')} className="flex-1 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold">1/2</button>
                      <button onClick={() => handleForceEndGame(g.id, 'abort')} className="py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded text-[10px] font-bold">Abort</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: REPORTS QUEUE */}
        {activeTab === 'reports' && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Flag className="w-5 h-5 text-orange-400" /> Player Incident Reports
            </h2>

            {reports.length === 0 ? (
              <p className="text-slate-600 text-xs font-mono py-12 text-center">No reports submitted yet.</p>
            ) : (
              <div className="space-y-3">
                {reports.map(r => (
                  <div key={r.id} className="p-4 bg-slate-950 border border-slate-850 rounded-xl flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          {r.reason}
                        </span>
                        <span className="text-xs text-slate-400 font-semibold">
                          Reported by <strong className="text-slate-200">@{r.reporter_name}</strong>
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white">Accused Player: @{r.reported_name}</h4>
                      {r.details && <p className="text-xs text-slate-400 italic mt-1">"{r.details}"</p>}
                      <span className="text-[10px] text-slate-500 font-mono">{new Date(r.created_at).toLocaleString()}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {r.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => handleUpdateReport(r.id, 'resolved')}
                            className="px-3 py-1.5 bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold hover:bg-emerald-600/30"
                          >
                            Mark Resolved
                          </button>
                          <button
                            onClick={() => handleUpdateReport(r.id, 'dismissed')}
                            className="px-3 py-1.5 bg-slate-800 text-slate-400 rounded-lg text-xs font-bold hover:text-white"
                          >
                            Dismiss
                          </button>
                        </>
                      ) : (
                        <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase ${
                          r.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {r.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: GLOBAL BROADCAST */}
        {activeTab === 'broadcast' && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Radio size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Send Realtime System Broadcast</h2>
                <p className="text-xs text-slate-400">Push an instant banner message to all online players' screens in real time.</p>
              </div>
            </div>

            <textarea
              value={broadcastText}
              onChange={e => setBroadcastText(e.target.value)}
              placeholder="e.g. Server maintenance scheduled in 15 minutes. Please complete ongoing matches."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500 min-h-[100px]"
            />

            {broadcastSent && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle size={16} /> Broadcast sent to all connected players!
              </div>
            )}

            <button
              onClick={handleSendBroadcast}
              disabled={!broadcastText.trim()}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20 active:scale-95 disabled:opacity-50"
            >
              <Megaphone size={16} /> Push Announcement
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

function AdminStatWidget({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-md">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-black text-white">{value}</div>
    </div>
  );
}
