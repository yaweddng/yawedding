import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Send, CheckCircle, AlertCircle } from 'lucide-react';

export const ReportMissingName = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');

    try {
      const res = await fetch('/api/report-missing-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, details }),
      });

      if (res.ok) {
        setStatus('success');
        setName('');
        setEmail('');
        setDetails('');
      } else {
        setStatus('error');
      }
    } catch (err) {
      setStatus('error');
    }
  };

  return (
    <div className="pt-32 pb-20 px-4">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-8 rounded-[32px] border border-white/5"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center text-brand">
              <UserPlus size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Report Missing Name</h1>
              <p className="text-gray-400 text-sm">Submit a name that is missing from our records.</p>
            </div>
          </div>

          {status === 'success' ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-12"
            >
              <div className="w-20 h-20 rounded-full bg-brand/10 flex items-center justify-center text-brand mx-auto mb-6">
                <CheckCircle size={40} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Report Submitted!</h2>
              <p className="text-gray-400 mb-8">Thank you for letting us know. We will review and update our records shortly.</p>
              <button
                onClick={() => setStatus('idle')}
                className="bg-brand text-dark px-8 py-3 rounded-full font-bold hover:shadow-[0_0_20px_rgba(0,200,150,0.4)] transition-all"
              >
                Submit Another
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Missing Name</label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter the full name"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-brand transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Your Email (Optional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-brand transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Additional Details</label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Any extra information..."
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-brand transition-all resize-none"
                />
              </div>

              {status === 'error' && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 p-4 rounded-xl border border-red-400/20">
                  <AlertCircle size={16} />
                  <span>Failed to submit report. Please try again.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-brand text-dark py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,200,150,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'loading' ? (
                  <div className="w-5 h-5 border-2 border-dark border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send size={18} />
                    Submit Report
                  </>
                )}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  );
};
