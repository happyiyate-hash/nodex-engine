import React, { useState } from 'react';
import { useTerminal, NavigationTab } from '../../context/TerminalContext';
import {
  LayoutDashboard,
  Layers,
  Flame,
  Terminal,
  Menu,
  X,
  ShieldCheck,
  Cpu,
  Sliders,
  Power,
  ShieldAlert,
} from 'lucide-react';

export const MobileNav: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    positions,
    tokens,
    engineStatus,
    toggleEngine,
    toggleStrategy,
    selectedToken,
    closeTokenDetail,
  } = useTerminal();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const openPositionsCount = positions.filter((p) => p.status === 'OPEN').length;

  const handleSelectTab = (tab: NavigationTab) => {
    closeTokenDetail();
    setActiveTab(tab);
    setDrawerOpen(false);
  };

  return (
    <>
      {/* Mobile Drawer Overlay with Frosted Glass */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-md transition-all duration-200"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="backdrop-blur-3xl bg-[#111111]/90 rounded-t-3xl p-4 max-h-[80vh] overflow-y-auto space-y-3 border-t border-white/20 shadow-[0_-16px_40px_rgba(0,0,0,0.85)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg glass-icon flex items-center justify-center font-mono font-bold text-[11px] text-white">
                  NX
                </div>
                <div>
                  <div className="font-mono text-xs font-bold text-white tracking-wider">NODEX TERMINAL</div>
                  <div className="text-[10px] font-mono text-amber-400">PAPER CORE ACTIVE</div>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-7 h-7 rounded-lg glass-icon flex items-center justify-center text-[#a3a3a3] hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Navigation links in drawer */}
            <div className="grid grid-cols-1 gap-1 font-mono text-xs">
              <button
                onClick={() => handleSelectTab('overview')}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                  activeTab === 'overview' && !selectedToken
                    ? 'glass-card border-white/20 text-white font-medium'
                    : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <div className="w-7 h-7 rounded-lg glass-icon flex items-center justify-center text-white">
                  <LayoutDashboard className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-white">Overview Dashboard</div>
                  <div className="text-[10px] text-[#737373]">Full-width portfolio & live chart</div>
                </div>
              </button>

              <button
                onClick={() => handleSelectTab('positions')}
                className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
                  activeTab === 'positions' && !selectedToken
                    ? 'glass-card border-white/20 text-white font-medium'
                    : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg glass-icon flex items-center justify-center text-emerald-400">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-white">Positions</div>
                    <div className="text-[10px] text-[#737373]">Active holdings & P&L</div>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full glass-icon text-white font-mono">
                  {openPositionsCount} OPEN
                </span>
              </button>

              <button
                onClick={() => handleSelectTab('live_feed')}
                className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
                  activeTab === 'live_feed' && !selectedToken
                    ? 'glass-card border-white/20 text-white font-medium'
                    : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg glass-icon flex items-center justify-center text-amber-400">
                    <Flame className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-white">Live Solana Feed</div>
                    <div className="text-[10px] text-[#737373]">Real-time Geyser detections</div>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full glass-icon text-emerald-400 font-mono">
                  {tokens.length} TOKENS
                </span>
              </button>

              <button
                onClick={() => handleSelectTab('event_monitor')}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                  activeTab === 'event_monitor' && !selectedToken
                    ? 'glass-card border-white/20 text-white font-medium'
                    : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <div className="w-7 h-7 rounded-lg glass-icon flex items-center justify-center text-purple-400">
                  <Terminal className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-white">Event Stream & JSON</div>
                  <div className="text-[10px] text-[#737373]">WebSocket inspector</div>
                </div>
              </button>

              <button
                onClick={() => handleSelectTab('strategy')}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                  activeTab === 'strategy' && !selectedToken
                    ? 'glass-card border-white/20 text-white font-medium'
                    : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <div className="w-7 h-7 rounded-lg glass-icon flex items-center justify-center text-blue-400">
                  <Cpu className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-white">Strategy & Risk Rules</div>
                  <div className="text-[10px] text-[#737373]">Configure qualification engine</div>
                </div>
              </button>

              <button
                onClick={() => handleSelectTab('token_intelligence')}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                  activeTab === 'token_intelligence' && !selectedToken
                    ? 'glass-card border-white/20 text-white font-medium'
                    : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <div className="w-7 h-7 rounded-lg glass-icon flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-white">Token Intelligence</div>
                  <div className="text-[10px] text-[#737373]">Security & freeze checks</div>
                </div>
              </button>

              <button
                onClick={() => handleSelectTab('settings')}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                  activeTab === 'settings' && !selectedToken
                    ? 'glass-card border-white/20 text-white font-medium'
                    : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <div className="w-7 h-7 rounded-lg glass-icon flex items-center justify-center text-[#a3a3a3]">
                  <Sliders className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-white">Engine Settings</div>
                  <div className="text-[10px] text-[#737373]">Rust Axum & RPC config</div>
                </div>
              </button>
            </div>

            {/* Quick Engine Controls */}
            <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-2">
              <button
                onClick={toggleEngine}
                className="py-2 rounded-xl glass-card flex items-center justify-center gap-1.5 text-xs font-mono font-medium text-white active:scale-95 transition-transform"
              >
                <Power className="w-3 h-3 text-emerald-400" />
                <span>{engineStatus.running ? 'Stop Engine' : 'Start Engine'}</span>
              </button>
              <button
                onClick={toggleStrategy}
                className="py-2 rounded-xl glass-card flex items-center justify-center gap-1.5 text-xs font-mono font-medium text-white active:scale-95 transition-transform"
              >
                <ShieldAlert className="w-3 h-3 text-amber-400" />
                <span>{engineStatus.strategy_paused ? 'Resume Strat' : 'Pause Strat'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Frosted Glass Bottom Navigation Card for Mobile */}
      {/* Positioned comfortably higher (bottom-5 sm:bottom-6) with height h-14 (56px) and vertical stacked icon + text */}
      <div className="fixed bottom-5 sm:bottom-6 inset-x-4 max-w-sm sm:max-w-md mx-auto z-40 select-none pointer-events-auto">
        <nav className="h-14 px-1.5 glass-nav-float rounded-2xl flex items-center justify-between gap-1 shadow-2xl">
          {/* 1. Overview */}
          <button
            onClick={() => handleSelectTab('overview')}
            aria-label="Overview"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 px-1 rounded-xl cursor-pointer touch-manipulation active:scale-95 transition-all ${
              activeTab === 'overview' && !selectedToken
                ? 'bg-white/[0.12] border border-white/20 text-white shadow-sm'
                : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0 mb-0.5" />
            <span className="text-[10px] font-mono tracking-tight leading-none">Overview</span>
          </button>

          {/* 2. Positions */}
          <button
            onClick={() => handleSelectTab('positions')}
            aria-label="Positions"
            className={`relative flex flex-col items-center justify-center flex-1 h-full py-1 px-1 rounded-xl cursor-pointer touch-manipulation active:scale-95 transition-all ${
              activeTab === 'positions' && !selectedToken
                ? 'bg-white/[0.12] border border-white/20 text-emerald-400 shadow-sm'
                : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <div className="relative mb-0.5">
              <Layers className="w-4 h-4 shrink-0" />
              {openPositionsCount > 0 && (
                <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-black animate-pulse" />
              )}
            </div>
            <span className="text-[10px] font-mono tracking-tight leading-none">Positions</span>
          </button>

          {/* 3. Live Feed */}
          <button
            onClick={() => handleSelectTab('live_feed')}
            aria-label="Live Feed"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 px-1 rounded-xl cursor-pointer touch-manipulation active:scale-95 transition-all ${
              activeTab === 'live_feed' && !selectedToken
                ? 'bg-white/[0.12] border border-white/20 text-amber-400 shadow-sm'
                : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Flame className="w-4 h-4 shrink-0 mb-0.5" />
            <span className="text-[10px] font-mono tracking-tight leading-none">Live Feed</span>
          </button>

          {/* 4. Events */}
          <button
            onClick={() => handleSelectTab('event_monitor')}
            aria-label="Events"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 px-1 rounded-xl cursor-pointer touch-manipulation active:scale-95 transition-all ${
              activeTab === 'event_monitor' && !selectedToken
                ? 'bg-white/[0.12] border border-white/20 text-purple-400 shadow-sm'
                : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Terminal className="w-4 h-4 shrink-0 mb-0.5" />
            <span className="text-[10px] font-mono tracking-tight leading-none">Events</span>
          </button>

          {/* 5. More Menu */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="More Menu"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 px-1 rounded-xl cursor-pointer touch-manipulation active:scale-95 transition-all ${
              ['strategy', 'token_intelligence', 'settings'].includes(activeTab) && !selectedToken
                ? 'bg-white/[0.12] border border-white/20 text-white shadow-sm'
                : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Menu className="w-4 h-4 shrink-0 mb-0.5" />
            <span className="text-[10px] font-mono tracking-tight leading-none">More</span>
          </button>
        </nav>
      </div>
    </>
  );
};
