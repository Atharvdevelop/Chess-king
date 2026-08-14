import { useState, useCallback } from 'react';
import {
  Shield, ArrowLeft, Users, Key, Eye, EyeOff,
  CheckCircle, XCircle, Loader2, Search, RefreshCw,
  Lock
} from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  username: string;
  created_at: string;
  last_sign_in_at: string | null;
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

  // ── Users list ─────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [search, setSearch] = useState('');

  // ── Change password ────────────────────────────────────────────────────────
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [changing, setChanging] = useState(false);
  const [changeResult, setChangeResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // ── Call edge function ─────────────────────────────────────────────────────
  const callAdmin = useCallback(async (body: object) => {
    let res: Response;
    try {
      res = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      throw new Error(`Network error connecting to Edge Function: ${err.message}`);
    }

    if (res.status === 404) {
      throw new Error('Edge Function not deployed yet. Please run: npx supabase functions deploy admin-panel');
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new Error(`Server returned status ${res.status} with invalid response.`);
    }

    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json;
  }, [adminSecret]);

  // ── Verify admin secret by listing users ──────────────────────────────────
  const handleAuth = async () => {
    if (!adminSecret.trim()) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const data = await callAdmin({ action: 'list_users' });
      setUsers(data.users ?? []);
      setAuthenticated(true);
    } catch (err: any) {
      setAuthError(err.message ?? 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const data = await callAdmin({ action: 'list_users' });
      setUsers(data.users ?? []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!selectedUser || !newPassword.trim()) return;
    setChanging(true);
    setChangeResult(null);
    try {
      await callAdmin({ action: 'change_password', userId: selectedUser.id, newPassword });
      setChangeResult({ ok: true, msg: `Password changed for ${selectedUser.username}` });
      setNewPassword('');
      setTimeout(() => setChangeResult(null), 5000);
    } catch (err: any) {
      setChangeResult({ ok: false, msg: err.message });
    } finally {
      setChanging(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  function fmtDate(iso: string | null) {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ── Admin password gate ────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <button onClick={onBack} className="text-slate-500 hover:text-slate-300 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-violet-400" />
              <span className="text-white font-bold text-lg">Admin Panel</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur">
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(139,92,246,0.2)]">
                <Lock className="w-8 h-8 text-violet-400" />
              </div>
              <h2 className="text-xl font-black text-white">Admin Access</h2>
              <p className="text-slate-500 text-sm mt-1 text-center">Enter your admin secret to continue</p>
            </div>

            <div className="relative mb-4">
              <input
                type={showSecret ? 'text' : 'password'}
                value={adminSecret}
                onChange={e => setAdminSecret(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAuth()}
                placeholder="Admin secret..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white font-mono text-sm focus:outline-none focus:border-violet-500/60 focus:shadow-[0_0_12px_rgba(139,92,246,0.2)] transition-all"
              />
              <button
                onClick={() => setShowSecret(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {authError && (
              <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 mb-4">
                <XCircle size={14} />
                <span>{authError}</span>
              </div>
            )}

            <button
              onClick={handleAuth}
              disabled={authLoading || !adminSecret.trim()}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-violet-900/40 disabled:text-violet-700 text-white font-bold py-3 rounded-xl transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
            >
              {authLoading ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
              {authLoading ? 'Authenticating...' : 'Enter Admin Panel'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Admin Panel ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-8 antialiased">
      {/* Decorative glows */}
      <div className="fixed top-0 left-0 w-96 h-96 bg-violet-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-cyan-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-6xl mx-auto z-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-800 bg-slate-900/40 text-slate-400 text-xs font-bold hover:text-white transition-all"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <div className="flex items-center gap-2 px-4 py-2 bg-violet-600/10 border border-violet-500/30 rounded-lg">
              <Shield size={14} className="text-violet-400" />
              <span className="text-violet-300 font-bold text-sm">Admin Panel</span>
            </div>
          </div>
          <button
            onClick={loadUsers}
            disabled={usersLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-800 bg-slate-900/40 text-slate-400 text-xs font-bold hover:text-white transition-all"
          >
            <RefreshCw size={14} className={usersLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: User List ────────────────────────────────────────────── */}
          <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
              <Users size={16} className="text-cyan-400" />
              <h2 className="font-bold text-white text-sm">Registered Users</h2>
              <span className="ml-auto text-xs text-slate-500 font-mono bg-slate-800 px-2 py-0.5 rounded-full">
                {users.length} total
              </span>
            </div>

            {/* Search */}
            <div className="px-6 py-3 border-b border-slate-800/60">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by username or email..."
                  className="w-full bg-slate-950/60 border border-slate-700/60 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-all"
                />
              </div>
            </div>

            {/* Users table */}
            <div className="overflow-y-auto max-h-[480px]">
              {filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                  <Users size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">No users found</p>
                </div>
              ) : (
                filteredUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setSelectedUser(u); setNewPassword(''); setChangeResult(null); }}
                    className={`w-full flex items-center gap-4 px-6 py-4 border-b border-slate-800/40 text-left transition-all hover:bg-slate-800/40 ${
                      selectedUser?.id === u.id ? 'bg-violet-600/10 border-l-2 border-l-violet-500' : ''
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-slate-300">
                        {(u.username || u.email || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm truncate">{u.username}</span>
                      </div>
                      <div className="text-xs text-slate-500 truncate font-mono">{u.email}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-slate-600 font-mono">JOINED</div>
                      <div className="text-xs text-slate-400 font-mono">{fmtDate(u.created_at)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── Right: Change Password panel ──────────────────────────────── */}
          <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
              <Key size={16} className="text-amber-400" />
              <h2 className="font-bold text-white text-sm">Change Password</h2>
            </div>

            <div className="p-6">
              {!selectedUser ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-600 text-center">
                  <Key size={28} className="mb-3 opacity-30" />
                  <p className="text-sm">Select a user from the list<br />to change their password</p>
                </div>
              ) : (
                <>
                  {/* Selected user */}
                  <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-4 mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600/30 to-violet-900/30 border border-violet-500/40 flex items-center justify-center">
                        <span className="text-sm font-bold text-violet-300">
                          {selectedUser.username[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm">{selectedUser.username}</div>
                        <div className="text-xs text-slate-500 font-mono">{selectedUser.email}</div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-700/60 grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-slate-600 block">USER ID</span>
                        <span className="text-slate-400 text-[10px] break-all">{selectedUser.id}</span>
                      </div>
                      <div>
                        <span className="text-slate-600 block">LAST LOGIN</span>
                        <span className="text-slate-400">{fmtDate(selectedUser.last_sign_in_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* New password input */}
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    New Password
                  </label>
                  <div className="relative mb-4">
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                      placeholder="Min. 6 characters..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white font-mono text-sm focus:outline-none focus:border-amber-500/60 focus:shadow-[0_0_12px_rgba(245,158,11,0.15)] transition-all"
                    />
                    <button
                      onClick={() => setShowNewPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* Result feedback */}
                  {changeResult && (
                    <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2.5 mb-4 ${
                      changeResult.ok
                        ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                        : 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                    }`}>
                      {changeResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      <span className="font-medium">{changeResult.msg}</span>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    onClick={handleChangePassword}
                    disabled={changing || newPassword.length < 6}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-900/30 disabled:text-amber-800 text-slate-950 font-bold py-3 rounded-xl transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                  >
                    {changing ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
                    {changing ? 'Changing...' : 'Change Password'}
                  </button>

                  <button
                    onClick={() => { setSelectedUser(null); setNewPassword(''); setChangeResult(null); }}
                    className="w-full mt-2 text-slate-500 hover:text-slate-300 text-xs font-medium py-2 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
