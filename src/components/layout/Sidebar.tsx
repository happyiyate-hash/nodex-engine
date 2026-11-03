import React from 'react';
import { useTerminal, NavigationTab } from '../../context/TerminalContext';
import {
  LayoutDashboard,
  Layers,
  Flame,
  Terminal,
  ShieldCheck,
  Cpu,
  Sliders,
  Power,
  ShieldAlert,
} from 'lucide-react';

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ElementType;
  badge?: string | number;
  badgeColor?: string;
}

export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    positions,
    tokens,
    events,
    engineStatus,
    toggleEngine,
    toggleStrategy,
    settings,
    selectedToken,
    closeTokenDetail,
  } = useTerminal();

  const openPositionsCount = positions.filter((p) => p.status === 'OPEN').length;

  const navItems: NavItem[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: LayoutDashboard,
    },
    {
      id: 'positions',
      label: 'Positions',
      icon: Layers,
      badge: openPositionsCount,
      badgeColor: 'glass-icon text-white',
    },
    {
      id: 'live_feed',
      label: 'Live Feed',
      icon: Flame,
      badge: tokens.length,
      badgeColor: 'glass-icon text-emerald-400',
    },
    {
      id: 'event_monitor',
      label: 'Event Monitor',
      icon: Terminal,
      badge: events.length > 0 ? 'LIVE' : undefined,
      badgeColor: 'glass-icon text-amber-400',
    },
    {
      id: 'strategy',
      label: 'Strategy & Risk',
      icon: Cpu,
    },
    {
      id: 'token_intelligence',
      label: 'Token Intelligence',
      icon: ShieldCheck,
    },
    {
      id: 'settings',
      label: 'Engine Settings',
      icon: Sliders,
    },
  ];

  return (
    <aside className="w-64 border-r border-white/[0.08] backdrop-blur-xl bg-[#0c0c0c]/65 flex flex-col justify-between select-none shrink-0 h-[calc(100vh-3.5rem)] sticky top-14">
      {/* Navigation Links */}
      <div className="p-3 space-y-1">
        <div className="px-3 py-2 text-[10px] font-mono font-medium text-[#737373] tracking-widest uppercase">
          Navigation Modules
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id && !selectedToken;
          return (
            <button
              key={item.id}
              onClick={() => {
                closeTokenDetail();
                setActiveTab(item.id);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-mono font-medium cursor-pointer touch-manipulation active:scale-[0.98] transition-all ${
                isActive
                  ? 'glass-card border-white/20 text-white shadow-sm'
                  : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg transition-colors ${
                  isActive ? 'glass-icon text-white' : 'text-[#737373]'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono tabular-nums ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Core Telemetry & Quick Controls */}
      <div className="p-3 border-t border-white/[0.08] space-y-3">
        {/* Connection Mode Card */}
        <div className="p-3 rounded-2xl glass-panel-subtle text-[11px] font-mono space-y-2">
          <div className="flex items-center justify-between text-[#737373]">
            <span>ENGINE CORE</span>
            <span className={engineStatus.running ? 'text-emerald-400 font-semibold' : 'text-red-400'}>
              {engineStatus.running ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[#8e8e93]">
            <span>TRANSPORT</span>
            <span className="text-white font-medium">
              {settings.mode === 'RUST_BACKEND' ? 'AXUM WS' : 'SIMULATOR'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[#8e8e93]">
            <span>STRATEGY</span>
            <span className={engineStatus.strategy_paused ? 'text-amber-400' : 'text-emerald-400 font-medium'}>
              {engineStatus.strategy_paused ? 'PAUSED' : 'ACTIVE'}
            </span>
          </div>
        </div>

        {/* Action Buttons with Frosted Glass */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={toggleEngine}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[11px] font-mono font-medium transition-all ${
              engineStatus.running
                ? 'glass-card text-[#a3a3a3] hover:text-white'
                : 'glass-card bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{engineStatus.running ? 'Stop Engine' : 'Start'}</span>
          </button>

          <button
            onClick={toggleStrategy}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[11px] font-mono font-medium transition-all ${
              engineStatus.strategy_paused
                ? 'glass-card bg-amber-950/30 border-amber-500/30 text-amber-300'
                : 'glass-card text-[#a3a3a3] hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{engineStatus.strategy_paused ? 'Resume' : 'Pause'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
