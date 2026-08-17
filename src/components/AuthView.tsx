import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Crown, Eye, EyeOff, Mail, Lock, User, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';

type ViewMode = 'signin' | 'register' | 'forgot' | 'reset-password';

interface AuthViewProps {
  onAuthSuccess: (userId: string, username: string) => void;
  initialMode?: ViewMode;
}

interface InputFieldProps {
  id: string;
  type?: string;
  label: string;
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  rightElement?: React.ReactNode;
}

function InputField({
  id, type = 'text', label, icon: Icon, value, onChange,
  placeholder, disabled, loading, rightElement,
}: InputFieldProps) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
        {label}
      </label>
      <div className="relative flex items-center">
        <Icon
          className="absolute left-3.5 text-slate-500 pointer-events-none"
          style={{ width: 18, height: 18 }}
        />
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || loading}
          className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-800 bg-slate-950/40
            text-white placeholder:text-slate-500 text-sm outline-none
            focus:border-violet-500 focus:shadow-[0_0_10px_rgba(139,92,246,0.2)]
            disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
        />
        {rightElement && (
          <div className="absolute right-3.5">{rightElement}</div>
        )}
      </div>
    </div>
  );
}

interface PasswordToggleProps {
  show: boolean;
  onToggle: () => void;
}

function PasswordToggle({ show, onToggle }: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-slate-500 hover:text-slate-400 transition-colors"
      tabIndex={-1}
    >
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}

export default function AuthView({ onAuthSuccess, initialMode }: AuthViewProps) {
  const [mode, setMode] = useState<ViewMode>(() => {
    if (initialMode) return initialMode;
    if (typeof window !== 'undefined' && window.location.pathname === '/reset-password') {
      return 'reset-password';
    }
    return 'signin';
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sign In fields
  const [signInIdentifier, setSignInIdentifier] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Register fields
  const [regUsername, setRegUsername] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Forgot password field
  const [forgotEmail, setForgotEmail] = useState('');

  // Reset password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const clearMessages = () => { setError(''); setSuccess(''); };

  const switchMode = (next: ViewMode) => {
    clearMessages();
    setShowPassword(false);
    setMode(next);
  };

  const togglePassword = () => setShowPassword(p => !p);

  // ─── SIGN IN ────────────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    const identifier = signInIdentifier.trim();
    const password = signInPassword;
    if (!identifier || !password) return;
    setLoading(true);
    try {
      let emailAddress = identifier;

      if (!identifier.includes('@')) {
        const { data, error } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', identifier)
          .maybeSingle();

        if (error || !data || !data.email) {
          throw new Error('No account found matching that username.');
        }
        emailAddress = data.email;
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailAddress,
        password: password,
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error('No user returned from Supabase.');

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', authData.user.id)
        .single();

      onAuthSuccess(authData.user.id, profile?.username ?? 'Player');
    } catch (err: any) {
      setError(err.message ?? 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── REGISTER ───────────────────────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (regPassword !== regConfirmPassword) { setError('Passwords do not match.'); return; }
    if (regPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (!regUsername.trim() || !regFullName.trim()) { setError('Username and full name are required.'); return; }
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: regEmail.trim(),
        password: regPassword,
        options: { data: { username: regUsername.trim(), full_name: regFullName.trim() } },
      });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('No user returned after registration.');

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        username: regUsername.trim(),
        full_name: regFullName.trim(),
        email: regEmail.trim(),
        created_at: new Date().toISOString(),
      });
      if (profileError) throw profileError;

      await supabase.from('players').upsert({
        id: data.user.id,
        username: regUsername.trim(),
        status: 'online',
        last_seen: new Date().toISOString()
      }, { onConflict: 'id' });

      if (data.session) {
        onAuthSuccess(data.user.id, regUsername.trim());
      } else {
        setSuccess('Account created! Check your email to confirm your address, then sign in.');
        switchMode('signin');
      }
    } catch (err: any) {
      setError(err.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── FORGOT PASSWORD ────────────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!forgotEmail.trim()) return;
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        forgotEmail.trim(),
        { redirectTo: `${window.location.origin}/reset-password` }
      );
      if (resetError) throw resetError;
      setSuccess('Recovery email sent! Check your inbox to reset your password.');
      setForgotEmail('');
    } catch (err: any) {
      setError(err.message ?? 'Failed to send recovery email.');
    } finally {
      setLoading(false);
    }
  };

  // ─── RESET PASSWORD ─────────────────────────────────────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;
      setSuccess('Password updated successfully! Redirecting to Sign In...');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.history.pushState({}, '', '/');
        }
        switchMode('signin');
      }, 2000);
    } catch (err: any) {
      setError(err.message ?? 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  const pwToggle = <PasswordToggle show={showPassword} onToggle={togglePassword} />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 antialiased relative">
      
      {/* Decorative board pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.02]">
        <div className="grid grid-cols-8 h-full w-full">
          {Array.from({ length: 64 }).map((_, i) => (
            <div
              key={i}
              className={`aspect-square ${(Math.floor(i / 8) + i) % 2 === 0 ? 'bg-white' : 'bg-transparent'}`}
            />
          ))}
        </div>
      </div>

      <div className="relative w-full max-w-md z-10">
        
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 shadow-xl shadow-violet-600/20 mb-4 animate-pulse">
            <Crown className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            Chess King
          </h1>
          <p className="text-slate-400 text-xs mt-1.5">
            {mode === 'signin' && 'Welcome back. Ready to play?'}
            {mode === 'register' && 'Create your account and start winning.'}
            {mode === 'forgot' && 'Recover access to your account.'}
          </p>
        </div>

        {/* Card Container (Glassmorphic dark panel) */}
        <div className="bg-slate-900/65 border border-slate-800/80 backdrop-blur-md rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          
          {/* Ambient light glow blobs */}
          <div className="absolute -top-16 -right-16 w-36 h-36 bg-violet-600/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none"></div>

          {/* Banners */}
          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2 animate-shake">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
              <span className="mt-0.5 shrink-0">✅</span>
              <span>{success}</span>
            </div>
          )}

          {/* ── SIGN IN ── */}
          {mode === 'signin' && (
            <>
              <form onSubmit={handleSignIn} className="space-y-4">
                <InputField
                  id="si-identifier" label="Username or Email" icon={Mail}
                  value={signInIdentifier} onChange={setSignInIdentifier}
                  placeholder="Enter username or email..." loading={loading}
                />
                <InputField
                  id="si-password" type={showPassword ? 'text' : 'password'} label="Password" icon={Lock}
                  value={signInPassword} onChange={setSignInPassword}
                  placeholder="••••••••" loading={loading}
                  rightElement={pwToggle}
                />
                <div className="flex justify-end pt-1">
                  <button
                    type="button" onClick={() => switchMode('forgot')}
                    className="text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors outline-none"
                  >
                    Forgot password?
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading || !signInIdentifier.trim() || !signInPassword}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-violet-600/25 hover:shadow-violet-600/35 flex items-center justify-center gap-2 mt-6 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign In <ChevronRight size={16} /></>}
                </button>
              </form>
              <div className="mt-6 text-center text-sm text-slate-400 border-t border-slate-900 pt-5">
                Don't have an account?{' '}
                <button onClick={() => switchMode('register')} className="text-violet-400 hover:text-violet-300 font-semibold transition-colors outline-none">
                  Register
                </button>
              </div>
            </>
          )}

          {/* ── REGISTER ── */}
          {mode === 'register' && (
            <>
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField
                    id="reg-username" label="Username" icon={User}
                    value={regUsername} onChange={setRegUsername}
                    placeholder="master1" loading={loading}
                  />
                  <InputField
                    id="reg-fullname" label="Full Name" icon={User}
                    value={regFullName} onChange={setRegFullName}
                    placeholder="Grand Master" loading={loading}
                  />
                </div>
                <InputField
                  id="reg-email" type="email" label="Email Address" icon={Mail}
                  value={regEmail} onChange={setRegEmail}
                  placeholder="you@domain.com" loading={loading}
                />
                <InputField
                  id="reg-password" type={showPassword ? 'text' : 'password'} label="Password" icon={Lock}
                  value={regPassword} onChange={setRegPassword}
                  placeholder="Min 6 characters" loading={loading}
                  rightElement={pwToggle}
                />
                <InputField
                  id="reg-confirm" type={showPassword ? 'text' : 'password'} label="Confirm Password" icon={Lock}
                  value={regConfirmPassword} onChange={setRegConfirmPassword}
                  placeholder="Repeat password" loading={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !regEmail.trim() || !regPassword || !regUsername.trim() || !regFullName.trim()}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-violet-600/25 hover:shadow-violet-600/35 flex items-center justify-center gap-2 mt-6 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Create Account <ChevronRight size={16} /></>}
                </button>
              </form>
              <div className="mt-6 text-center text-sm text-slate-400 border-t border-slate-900 pt-5">
                Already have an account?{' '}
                <button onClick={() => switchMode('signin')} className="text-violet-400 hover:text-violet-300 font-semibold transition-colors outline-none">
                  Sign In
                </button>
              </div>
            </>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {mode === 'forgot' && (
            <>
              <button
                onClick={() => switchMode('signin')}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 mb-5 transition-colors outline-none"
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>
              <h2 className="text-lg font-bold text-white mb-2">Forgot Password?</h2>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Enter your email address below. We'll send you a secure link to reset your password.
              </p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <InputField
                  id="forgot-email" type="email" label="Email Address" icon={Mail}
                  value={forgotEmail} onChange={setForgotEmail}
                  placeholder="you@domain.com" loading={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !forgotEmail.trim()}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-violet-600/25 hover:shadow-violet-600/35 flex items-center justify-center gap-2 mt-6 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Send Recovery Email <ChevronRight size={16} /></>}
                </button>
              </form>
            </>
          )}

          {/* ── RESET PASSWORD ── */}
          {mode === 'reset-password' && (
            <>
              <h2 className="text-lg font-bold text-white mb-2">Set New Password</h2>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Enter your new account password below.
              </p>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <InputField
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  label="New Password"
                  icon={Lock}
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="Min 6 characters"
                  loading={loading}
                  rightElement={pwToggle}
                />
                <InputField
                  id="confirm-new-password"
                  type={showPassword ? 'text' : 'password'}
                  label="Confirm Password"
                  icon={Lock}
                  value={confirmNewPassword}
                  onChange={setConfirmNewPassword}
                  placeholder="Repeat new password"
                  loading={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !newPassword || !confirmNewPassword}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-violet-600/25 hover:shadow-violet-600/35 flex items-center justify-center gap-2 mt-6 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Update Password <ChevronRight size={16} /></>}
                </button>
              </form>
              <div className="mt-6 text-center text-sm text-slate-400 border-t border-slate-900 pt-5">
                <button onClick={() => switchMode('signin')} className="text-violet-400 hover:text-violet-300 font-semibold transition-colors outline-none">
                  Back to Sign In
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
