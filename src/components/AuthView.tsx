import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Crown, Eye, EyeOff, Mail, Lock, User, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';

type ViewMode = 'signin' | 'register' | 'forgot';

interface AuthViewProps {
  onAuthSuccess: (userId: string, username: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components MUST live outside AuthView so React sees a stable component
// type across re-renders. Defining them inside causes every keystroke to
// unmount/remount the <input> (new component type = new DOM node = lost focus).
// ─────────────────────────────────────────────────────────────────────────────

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
      <label htmlFor={id} className="block text-sm font-semibold text-slate-600 mb-1.5">
        {label}
      </label>
      <div className="relative flex items-center">
        <Icon
          className="absolute left-3.5 text-slate-400 pointer-events-none"
          style={{ width: 18, height: 18 }}
        />
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || loading}
          className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-slate-50
            text-slate-900 placeholder:text-slate-400 text-sm
            focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
            disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        />
        {rightElement && (
          <div className="absolute right-3">{rightElement}</div>
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
      className="text-slate-400 hover:text-slate-600 transition-colors"
      tabIndex={-1}
    >
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function AuthView({ onAuthSuccess }: AuthViewProps) {
  const [mode, setMode] = useState<ViewMode>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sign In fields
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Register fields
  const [regUsername, setRegUsername] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Forgot password field
  const [forgotEmail, setForgotEmail] = useState('');

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
    if (!signInEmail.trim() || !signInPassword) return;
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: signInEmail.trim(),
        password: signInPassword,
      });
      if (authError) throw authError;
      if (!data.user) throw new Error('No user returned from Supabase.');

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', data.user.id)
        .single();

      onAuthSuccess(data.user.id, profile?.username ?? 'Player');
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

      await supabase.from('players').upsert(
        { username: regUsername.trim(), status: 'online', last_seen: new Date().toISOString() },
        { onConflict: 'username' }
      );

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

  // ─── Stable password-toggle element (value captured once per render) ────────
  const pwToggle = <PasswordToggle show={showPassword} onToggle={togglePassword} />;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950 to-slate-950 flex items-center justify-center p-4">
      {/* Decorative board pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-5">
        <div className="grid grid-cols-8 h-full">
          {Array.from({ length: 64 }).map((_, i) => (
            <div
              key={i}
              className={`aspect-square ${(Math.floor(i / 8) + i) % 2 === 0 ? 'bg-white' : 'bg-transparent'}`}
            />
          ))}
        </div>
      </div>

      <div className="relative w-full max-w-md">
        {/* ── Logo ── */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl
            bg-gradient-to-br from-yellow-400 to-amber-500 shadow-2xl shadow-amber-500/30 mb-4">
            <Crown className="w-10 h-10 text-white drop-shadow" />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight">
            Chess<span className="text-yellow-400">King</span>
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            {mode === 'signin' && 'Welcome back. Ready to play?'}
            {mode === 'register' && 'Create your account and start winning.'}
            {mode === 'forgot' && 'Recover access to your account.'}
          </p>
        </div>

        {/* ── Card ── */}
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl shadow-black/30 p-8">
          {/* Banners */}
          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-start gap-2">
              <span className="mt-0.5 shrink-0">✅</span>
              <span>{success}</span>
            </div>
          )}

          {/* ── SIGN IN ── */}
          {mode === 'signin' && (
            <>
              <h2 className="text-xl font-bold text-slate-800 mb-6">Sign In</h2>
              <form onSubmit={handleSignIn}>
                <InputField
                  id="si-email" type="email" label="Email address" icon={Mail}
                  value={signInEmail} onChange={setSignInEmail}
                  placeholder="you@example.com" loading={loading}
                />
                <InputField
                  id="si-password" type={showPassword ? 'text' : 'password'} label="Password" icon={Lock}
                  value={signInPassword} onChange={setSignInPassword}
                  placeholder="Your password" loading={loading}
                  rightElement={pwToggle}
                />
                <div className="flex justify-end mb-6">
                  <button
                    type="button" onClick={() => switchMode('forgot')}
                    className="text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading || !signInEmail.trim() || !signInPassword}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white
                    bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800
                    disabled:opacity-50 disabled:cursor-not-allowed
                    shadow-lg shadow-violet-500/20 transition-all duration-200 active:scale-95"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign In <ChevronRight size={18} /></>}
                </button>
              </form>
              <p className="text-center text-sm text-slate-500 mt-6">
                Don't have an account?{' '}
                <button onClick={() => switchMode('register')} className="text-violet-600 hover:text-violet-800 font-semibold transition-colors">
                  Register
                </button>
              </p>
            </>
          )}

          {/* ── REGISTER ── */}
          {mode === 'register' && (
            <>
              <h2 className="text-xl font-bold text-slate-800 mb-6">Create Account</h2>
              <form onSubmit={handleRegister}>
                <div className="grid grid-cols-2 gap-x-3">
                  <InputField
                    id="reg-username" label="Username" icon={User}
                    value={regUsername} onChange={setRegUsername}
                    placeholder="chess_master" loading={loading}
                  />
                  <InputField
                    id="reg-fullname" label="Full Name" icon={User}
                    value={regFullName} onChange={setRegFullName}
                    placeholder="Atharv Chaturvedi" loading={loading}
                  />
                </div>
                <InputField
                  id="reg-email" type="email" label="Email address" icon={Mail}
                  value={regEmail} onChange={setRegEmail}
                  placeholder="you@example.com" loading={loading}
                />
                <InputField
                  id="reg-password" type={showPassword ? 'text' : 'password'} label="Password" icon={Lock}
                  value={regPassword} onChange={setRegPassword}
                  placeholder="At least 6 characters" loading={loading}
                  rightElement={pwToggle}
                />
                <InputField
                  id="reg-confirm" type={showPassword ? 'text' : 'password'} label="Confirm Password" icon={Lock}
                  value={regConfirmPassword} onChange={setRegConfirmPassword}
                  placeholder="Repeat your password" loading={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !regEmail.trim() || !regPassword || !regUsername.trim() || !regFullName.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white mt-2
                    bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800
                    disabled:opacity-50 disabled:cursor-not-allowed
                    shadow-lg shadow-violet-500/20 transition-all duration-200 active:scale-95"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Create Account <ChevronRight size={18} /></>}
                </button>
              </form>
              <p className="text-center text-sm text-slate-500 mt-6">
                Already have an account?{' '}
                <button onClick={() => switchMode('signin')} className="text-violet-600 hover:text-violet-800 font-semibold transition-colors">
                  Sign In
                </button>
              </p>
            </>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {mode === 'forgot' && (
            <>
              <button
                onClick={() => switchMode('signin')}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-5 transition-colors"
              >
                <ArrowLeft size={15} /> Back to Sign In
              </button>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Forgot Password?</h2>
              <p className="text-sm text-slate-500 mb-6">
                Enter your email address and we'll send you a password reset link.
              </p>
              <form onSubmit={handleForgotPassword}>
                <InputField
                  id="forgot-email" type="email" label="Email address" icon={Mail}
                  value={forgotEmail} onChange={setForgotEmail}
                  placeholder="you@example.com" loading={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !forgotEmail.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white mt-2
                    bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800
                    disabled:opacity-50 disabled:cursor-not-allowed
                    shadow-lg shadow-violet-500/20 transition-all duration-200 active:scale-95"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Send Recovery Email <ChevronRight size={18} /></>}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          By continuing, you agree to our{' '}
          <span className="text-slate-400 underline cursor-pointer">Terms of Service</span>
          {' '}and{' '}
          <span className="text-slate-400 underline cursor-pointer">Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}
