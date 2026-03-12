import React from 'react';
import { motion } from 'framer-motion';
import { LogIn, UserPlus, Mail, Lock, User, ArrowRight, ShieldCheck, MessageSquare, Home } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export const Login = () => {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = React.useState<'login' | 'register' | 'register-customer' | 'forgot-password' | 'verify-otp' | 'reset-password'>('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [name, setName] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const navigate = useNavigate();

  const handleRedirect = (user: any) => {
    const redirectUrl = searchParams.get('redirect');
    if (redirectUrl) {
      navigate(redirectUrl);
      return;
    }
    
    if (user.role === 'admin') {
      navigate('/admin');
    } else if (user.role === 'customer') {
      navigate('/inbox');
    } else if (user.role === 'partner') {
      navigate('/dashboard');
    } else {
      navigate('/');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    let endpoint = '/api/auth/login';
    let body: any = { email, password };

    if (mode === 'register') {
      endpoint = '/api/auth/register';
      body = { email, password, name, username };
    } else if (mode === 'register-customer') {
      endpoint = '/api/auth/register-customer';
      body = { email, password, name, username };
    } else if (mode === 'verify-otp') {
      endpoint = '/api/auth/verify-otp';
      body = { email, otp };
    } else if (mode === 'forgot-password') {
      endpoint = '/api/auth/forgot-password';
      body = { email };
    } else if (mode === 'reset-password') {
      endpoint = '/api/auth/reset-password';
      body = { email, otp, newPassword };
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (res.ok) {
        if (mode === 'register' || mode === 'register-customer' || mode === 'forgot-password') {
          setMessage(data.message);
          setMode(mode === 'forgot-password' ? 'reset-password' : 'verify-otp');
        } else if (mode === 'verify-otp' || mode === 'login') {
          localStorage.setItem('ya-token', data.token || `user-token-${data.user.id}`);
          localStorage.setItem('ya-user', JSON.stringify(data.user));
          handleRedirect(data.user);
        } else if (mode === 'reset-password') {
          setMessage(data.message);
          setMode('login');
        }
      } else {
        if (data.needsVerification) {
          setError(data.error);
          setMode('verify-otp');
        } else {
          setError(data.error || 'Something went wrong');
        }
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-32 pb-20 bg-dark flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand/5 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand/10 rounded-2xl text-brand mb-6">
            {mode === 'login' ? <LogIn size={32} /> : mode.includes('register') ? <UserPlus size={32} /> : <ShieldCheck size={32} />}
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {mode === 'login' ? 'Welcome Back' : 
             mode === 'register' ? 'Join the Partnership' : 
             mode === 'register-customer' ? 'Register as Customer' :
             mode === 'verify-otp' ? 'Verify Account' :
             mode === 'forgot-password' ? 'Forgot Password' : 'Reset Password'}
          </h1>
          <p className="text-gray-400">
            {mode === 'login' ? 'Enter your credentials to access your dashboard' : 
             mode === 'verify-otp' ? `Enter the 6-digit code sent to ${email}` :
             mode === 'forgot-password' ? 'Enter your email to receive a reset code' :
             'Fill in the details below to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-8 rounded-[32px] border border-white/5 space-y-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-center gap-2 text-gray-500 hover:text-brand transition-colors text-sm mb-2"
          >
            <Home size={16} />
            Back to Home
          </button>
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
              {error}
            </div>
          )}
          {message && (
            <div className="p-4 bg-brand/10 border border-brand/20 rounded-xl text-brand text-sm text-center">
              {message}
            </div>
          )}

          {(mode === 'register' || mode === 'register-customer') && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-dark border border-white/10 rounded-xl pl-12 pr-4 py-3.5 focus:border-brand outline-none transition-all"
                    placeholder="John Doe"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Username</label>
                <div className="relative">
                  <ArrowRight className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input
                    required
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    className="w-full bg-dark border border-white/10 rounded-xl pl-12 pr-4 py-3.5 focus:border-brand outline-none transition-all"
                    placeholder="username"
                  />
                </div>
              </div>
            </>
          )}

          {(mode !== 'verify-otp' && mode !== 'reset-password') && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-dark border border-white/10 rounded-xl pl-12 pr-4 py-3.5 focus:border-brand outline-none transition-all"
                  placeholder="email@example.com"
                />
              </div>
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'register-customer') && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-dark border border-white/10 rounded-xl pl-12 pr-4 py-3.5 focus:border-brand outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
              {mode === 'login' && (
                <button 
                  type="button"
                  onClick={() => setMode('forgot-password')}
                  className="text-[10px] text-gray-500 hover:text-brand transition-colors ml-1"
                >
                  Forgot password?
                </button>
              )}
            </div>
          )}

          {(mode === 'verify-otp' || mode === 'reset-password') && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">Verification Code</label>
              <div className="relative">
                <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  required
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full bg-dark border border-white/10 rounded-xl pl-12 pr-4 py-3.5 focus:border-brand outline-none transition-all text-center tracking-[1em] font-bold"
                  placeholder="000000"
                />
              </div>
            </div>
          )}

          {mode === 'reset-password' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">New Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  required
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-dark border border-white/10 rounded-xl pl-12 pr-4 py-3.5 focus:border-brand outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          <button
            disabled={loading}
            className="w-full bg-brand text-dark py-4 rounded-xl font-bold hover:shadow-lg hover:shadow-brand/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-dark border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {mode === 'login' ? 'Sign In' : 
                 mode === 'verify-otp' ? 'Verify Code' :
                 mode === 'forgot-password' ? 'Send Reset Code' :
                 mode === 'reset-password' ? 'Reset Password' : 'Create Account'}
                <ArrowRight size={18} />
              </>
            )}
          </button>

          <div className="text-center pt-4 flex flex-col gap-2">
            {mode !== 'login' && (
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-sm text-gray-400 hover:text-brand transition-colors"
              >
                Back to Sign In
              </button>
            )}
            {mode === 'login' && (
              <>
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-sm text-gray-400 hover:text-brand transition-colors"
                >
                  Want to be a partner? Register here
                </button>
                <button
                  type="button"
                  onClick={() => setMode('register-customer')}
                  className="text-sm text-gray-400 hover:text-brand transition-colors"
                >
                  Just want to chat? Register as Customer
                </button>
              </>
            )}
          </div>
        </form>

        <div className="mt-8 flex items-center justify-center gap-2 text-gray-500 text-xs">
          <ShieldCheck size={14} />
          <span>Secure multi-tenant platform architecture</span>
        </div>
      </motion.div>
    </div>
  );
};
