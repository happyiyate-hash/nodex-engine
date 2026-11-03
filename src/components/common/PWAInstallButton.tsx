import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, Share, PlusSquare, X, Check, Smartphone } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'nav' | 'compact' | 'drawer';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'nav' }) => {
  const { isInstallable, hasPrompt, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  // If already installed and not just installed, we can render a quiet badge or null
  if (isInstalled && !justInstalled) {
    if (variant === 'drawer') {
      return (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl glass-card text-[#a3a3a3] font-mono text-xs">
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-white">PWA Installed</span>
          </div>
          <span className="text-[10px] text-emerald-400 font-mono">STANDALONE</span>
        </div>
      );
    }
    return null;
  }

  const handleClick = async () => {
    if (hasPrompt) {
      const accepted = await promptInstall();
      if (accepted) {
        setJustInstalled(true);
      }
    } else if (isIOS) {
      setShowIOSModal(true);
    } else {
      // Browser didn't expose beforeinstallprompt yet (or already installed in chrome)
      // Provide user friendly fallback guide modal
      setShowIOSModal(true);
    }
  };

  return (
    <>
      {variant === 'drawer' ? (
        <button
          onClick={handleClick}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl glass-card border-white/20 text-white font-mono text-xs hover:border-emerald-500/40 transition-all cursor-pointer touch-manipulation group"
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg glass-icon flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
              <Download className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <div className="font-medium text-white flex items-center gap-1.5">
                <span>Install NodeX PWA</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">FAST</span>
              </div>
              <div className="text-[10px] text-[#737373]">Add to Home Screen & offline cache</div>
            </div>
          </div>
          <Smartphone className="w-3.5 h-3.5 text-[#8e8e93]" />
        </button>
      ) : (
        <button
          onClick={handleClick}
          title="Install NodeX as a Progressive Web App (Desktop or Mobile)"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-lg glass-icon text-white hover:border-emerald-500/40 hover:text-emerald-400 transition-all cursor-pointer touch-manipulation group"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
          <span className="hidden sm:inline">INSTALL APP</span>
          <span className="sm:hidden">PWA</span>
        </button>
      )}

      {/* iOS & Manual Install Modal Guide */}
      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl glass-card p-5 border border-white/20 shadow-2xl relative space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg glass-icon flex items-center justify-center font-bold text-xs text-emerald-400 font-mono">
                  NX
                </div>
                <div>
                  <h3 className="font-mono text-sm font-bold text-white">Install NodeX Terminal</h3>
                  <p className="text-[11px] text-[#8e8e93] font-mono">Progressive Web Application</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 rounded-lg text-[#8e8e93] hover:text-white glass-icon"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <p className="text-[#d4d4d8] leading-relaxed">
                Run NodeX as an ultra-low-latency standalone institutional terminal directly from your dock or home screen.
              </p>

              <div className="space-y-2 pt-1">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <div className="w-6 h-6 rounded-lg glass-icon flex items-center justify-center shrink-0 text-emerald-400 font-bold text-xs">
                    1
                  </div>
                  <div className="text-xs text-[#a3a3a3]">
                    Tap the <strong className="text-white">Share</strong> icon{' '}
                    <Share className="w-3.5 h-3.5 inline mx-1 text-emerald-400" /> in Safari or Chrome.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <div className="w-6 h-6 rounded-lg glass-icon flex items-center justify-center shrink-0 text-emerald-400 font-bold text-xs">
                    2
                  </div>
                  <div className="text-xs text-[#a3a3a3]">
                    Scroll down and select{' '}
                    <strong className="text-white">Add to Home Screen</strong>{' '}
                    <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-emerald-400" />.
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowIOSModal(false)}
                className="w-full py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-semibold tracking-wider transition-colors"
              >
                GOT IT
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
