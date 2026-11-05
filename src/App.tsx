import React from 'react';
import { TerminalProvider, useTerminal } from './context/TerminalContext';
import { MobileNav } from './components/layout/MobileNav';
import { OverviewPage } from './components/views/OverviewPage';
import { PositionsPage } from './components/views/PositionsPage';
import { LiveFeedPage } from './components/views/LiveFeedPage';
import { EventMonitorPage } from './components/views/EventMonitorPage';
import { StrategyPage } from './components/views/StrategyPage';
import { TokenIntelligencePage } from './components/views/TokenIntelligencePage';
import { SettingsPage } from './components/views/SettingsPage';
import { TokenDetailPage } from './components/views/TokenDetailPage';

const MainLayout: React.FC = () => {
  const { activeTab, selectedToken } = useTerminal();

  const renderActiveView = () => {
    if (selectedToken) return <TokenDetailPage />;

    switch (activeTab) {
      case 'overview': return <OverviewPage />;
      case 'positions': return <PositionsPage />;
      case 'live_feed': return <LiveFeedPage />;
      case 'event_monitor': return <EventMonitorPage />;
      case 'strategy': return <StrategyPage />;
      case 'token_intelligence': return <TokenIntelligencePage />;
      case 'settings': return <SettingsPage />;
      default: return <OverviewPage />;
    }
  };

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#070707] text-white font-sans relative selection:bg-white/20">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[800px] h-[400px] bg-emerald-500/[0.015] rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[700px] h-[400px] bg-purple-500/[0.015] rounded-full blur-[160px]" />
      </div>

      <main className="relative z-10 h-full w-full overflow-y-auto pb-20 focus:outline-none">
        {renderActiveView()}
      </main>

      <MobileNav />
    </div>
  );
};

export default function App() {
  return (
    <TerminalProvider>
      <MainLayout />
    </TerminalProvider>
  );
};
