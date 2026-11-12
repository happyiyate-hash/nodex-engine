import React from 'react';
import { useTerminal, NavigationTab } from '../../context/TerminalContext';
import {
  Home,
  BarChart3,
  Radio,
  Box,
  TrendingUp,
  Settings,
  Code2,
  SlidersHorizontal,
  Info,
} from 'lucide-react';

interface SidebarItem {
  id: NavigationTab;
  label: string;
  icon: React.ElementType;
}

export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    engineStatus,
    toggleEngine,
    selectedToken,
    closeTokenDetail,
  } = useTerminal();

  const navItems: SidebarItem[] = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'positions', label: 'Positions', icon: BarChart3 },
    { id: 'live_feed', label: 'Live Feed', icon: Radio },
    { id: 'token_details', label: 'Token Details', icon: Box },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'strategy', label: 'Strategy', icon: Settings },
    { id: 'event_monitor', label: 'JSON Monitor', icon: Code2 },
    { id: 'settings', label: 'Engine Settings', icon: SlidersHorizontal },
    { id: 'about', label: 'About', icon: Info },
  ];

  return (
    <aside className="w-[218px] bg-[#09090b] border-r border-[#1e2025] flex flex-col justify-between select-none shrink-0 h-[calc(100vh-3.25rem)] sticky top-13 text-xs overflow-y-auto no-scrollbar">
      {/* Top Brand & Nav Menu */}
      <div className="p-3 space-y-4">
        {/* Brand Zone */}
        <div
          className="flex items-center gap-2.5 px-1 py-0.5 cursor-pointer"
          onClick={() => {
            closeTokenDetail();
            setActiveTab('overview');
          }}
        >
          <img
            src="/icons/icon-192.png"
            alt="NodeX"
            className="w-8 h-8 rounded-lg object-contain shrink-0"
            draggable={false}
          />
          <div className="leading-tight">
            <div className="font-semibold text-sm text-white tracking-wide font-sans">NodeX</div>
            <div className="text-[10px] text-[#71717a] font-normal tracking-tight">Solana Trading Terminal</div>
          </div>
        </div>

        {/* Navigation Modules */}
        <nav className="space-y-0.5">
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
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-[#18191d] text-white shadow-sm border border-white/[0.08]'
                    : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#8e8e93]'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Status & Promo Cards */}
      <div className="p-3 space-y-2.5 pt-0">
        {/* Solana Mainnet & Engine Status Card */}
        <div className="p-2.5 rounded-xl bg-[#121316] border border-[#212328] space-y-2">
          {/* Solana Header */}
          <div className="flex items-center gap-2">
            {/* Solana Logo Bars */}
            <div className="w-5 h-4 flex flex-col justify-between shrink-0">
              <div className="h-1 w-full rounded-sm bg-gradient-to-r from-[#00FFA3] to-[#03E1FF]" />
              <div className="h-1 w-3/4 rounded-sm bg-gradient-to-r from-[#03E1FF] to-[#DC1FFF] ml-auto" />
              <div className="h-1 w-full rounded-sm bg-gradient-to-r from-[#DC1FFF] to-[#00FFA3]" />
            </div>
            <div className="leading-none">
              <span className="text-[11px] font-bold text-white tracking-wider">SOLANA</span>
              <span className="block text-[9px] text-[#71717a]">Mainnet</span>
            </div>
          </div>

          {/* Engine Status */}
          <div className="space-y-0.5">
            <span className="text-[10px] text-[#71717a] block">Engine Status</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              <span className="text-xs font-bold text-[#10B981] tracking-wider uppercase">
                {engineStatus.running ? 'RUNNING' : 'STOPPED'}
              </span>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="flex items-center justify-between pt-1 border-t border-[#1e2025]">
            <div className="flex items-center gap-1.5 text-[10px] text-[#71717a]">
              <div className="w-3.5 h-3.5 rounded border border-[#3f3f46] flex items-center justify-center text-[8px]">
                ⚙
              </div>
              <span>Mode</span>
            </div>
            <button
              onClick={toggleEngine}
              title="Click to toggle engine mode"
              className="px-2 py-0.5 rounded bg-[#1e2025] hover:bg-[#27272a] border border-white/10 text-[10px] font-medium text-white transition-colors"
            >
              PAPER
            </button>
          </div>
        </div>

        {/* NodeX Promo / Horizon Card */}
        <div className="relative rounded-xl overflow-hidden bg-gradient-to-b from-[#13151b] to-[#090a0d] border border-[#212328] p-3 text-left">
          {/* Subtle curved planet horizon arc */}
          <div className="absolute -bottom-6 -right-6 w-28 h-28 rounded-full border border-white/10 bg-gradient-to-tr from-transparent via-[#1e293b]/40 to-transparent pointer-events-none" />
          <div className="relative z-10 space-y-0.5">
            <div className="font-semibold text-xs text-white">NodeX</div>
            <div className="text-[10px] text-[#8e8e93] leading-tight">
              Smart Trading.
              <br />
              Real Insights.
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
