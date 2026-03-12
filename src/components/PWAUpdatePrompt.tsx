import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';

export const PWAUpdatePrompt: React.FC = () => {
  const [show, setShow] = React.useState(false);
  const [registration, setRegistration] = React.useState<ServiceWorkerRegistration | null>(null);

  React.useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) {
          // Check if there's already a waiting worker
          if (reg.waiting) {
            setRegistration(reg);
            setShow(true);
          }

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setRegistration(reg);
                  setShow(true);
                }
              });
            }
          });
        }
      });

      // Listen for controlling service worker change
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
  }, []);

  const handleUpdate = () => {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-24 left-4 right-4 md:left-auto md:right-8 md:w-80 z-[100]"
        >
          <div className="bg-dark/90 backdrop-blur-xl border border-brand/20 p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand">
                <RefreshCw className="w-5 h-5 animate-spin-slow" />
              </div>
              <div>
                <p className="text-white font-bold text-sm">New Version Available</p>
                <p className="text-gray-400 text-xs">Update now for the latest features.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleUpdate}
                className="bg-brand text-dark px-4 py-2 rounded-lg text-xs font-bold hover:bg-brand-light transition-colors"
              >
                Update
              </button>
              <button
                onClick={() => setShow(false)}
                className="text-gray-500 hover:text-white transition-colors flex justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
