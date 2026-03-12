import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LogIn, Mail, Lock, ArrowRight, ShieldCheck, Home } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal = ({ isOpen, onClose }: LoginModalProps) => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('ya-token', data.token || `user-token-${data.user.id}`);
        localStorage.setItem('ya-user', JSON.stringify(data.user));
        
        if (data.user.role === 'admin') {
          window.location.href = '/admin';
        } else if (data.user.role === 'customer') {
          window.location.href = '/inbox';
        } else if (data.user.role === 'partner') {
          window.location.href = '/dashboard';
        } else {
          window.location.href = '/';
        }
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-[#151515] border border-white/10 rounded-[32px] p-8 shadow-2xl z-[120] overflow-hidden"
          >
            <button
              onClick={onClose}
              className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>

            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-brand/10 rounded-2xl text-brand mb-4">
                <LogIn size={32} />
              </div>
              <h2 className="text-2xl font-bold text-white">Welcome Back</h2>
              <p className="text-gray-400 text-sm mt-2">Sign in to access your messages</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <button
                type="button"
                onClick={() => window.location.href = '/'}
                className="w-full flex items-center justify-center gap-2 text-gray-500 hover:text-brand transition-colors text-xs mb-4"
              >
                <Home size={14} />
                Back to Home
              </button>
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs text-center">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-dark border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm focus:border-brand outline-none transition-all"
                    placeholder="email@example.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-dark border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm focus:border-brand outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                disabled={loading}
                className="w-full bg-brand text-dark py-3.5 rounded-xl font-bold hover:shadow-lg hover:shadow-brand/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-6"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-dark border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Sign In
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-gray-500 pt-4">
                Don't have an account? <a href="/login?redirect=/inbox" className="text-brand hover:underline">Register here</a>
              </p>
            </form>

            <div className="mt-8 flex items-center justify-center gap-2 text-gray-600 text-[10px]">
              <ShieldCheck size={12} />
              <span>Secure Authentication</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
