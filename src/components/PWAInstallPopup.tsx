import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Sparkles } from 'lucide-react';

export const PWAInstallPopup = () => {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Show popup after 30 seconds
    const timer = setTimeout(() => {
      setShow(true);
    }, 30000);

    // Custom event to trigger from other pages
    const handleShowEvent = () => setShow(true);
    window.addEventListener('show-pwa-install', handleShowEvent);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('show-pwa-install', handleShowEvent);
      clearTimeout(timer);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      setDeferredPrompt(null);
      setShow(false);
    } else {
      // Fallback for iOS or if prompt is not available
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIOS) {
        alert('To install on iOS:\n1. Tap the Share button at the bottom of the screen.\n2. Scroll down and tap "Add to Home Screen".');
      } else {
        alert('To install: Check your browser menu for an "Install" or "Add to Home Screen" option.');
      }
      setShow(false);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.9 }}
          className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 md:w-96 z-[100]"
        >
          <div className="bg-dark-lighter border border-brand/30 rounded-3xl p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand/10 rounded-full blur-2xl" />
            
            <button 
              onClick={() => setShow(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center shrink-0">
                <Smartphone className="text-brand" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={14} className="text-brand" />
                  <span className="text-brand text-[10px] font-bold uppercase tracking-widest">Mobile Experience</span>
                </div>
                <h3 className="text-lg font-bold text-white">Install YA Wedding</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Get the best experience with our mobile app. Fast, offline-ready, and secure.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleInstall}
                className="flex-grow bg-brand text-dark font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
              >
                <Download size={18} />
                Install
              </button>
              <button
                onClick={() => setShow(false)}
                className="px-6 py-3 rounded-xl border border-white/10 text-gray-400 font-medium hover:bg-white/5 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
