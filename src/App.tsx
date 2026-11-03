import React from 'react';
import { TerminalProvider, useTerminal } from './context/TerminalContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
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
    if (selectedToken) {
      return <TokenDetailPage />;
    }

    switch (activeTab) {
      case 'overview':
        return <OverviewPage />;
      case 'positions':
        return <PositionsPage />;
      case 'live_feed':
        return <LiveFeedPage />;
      case 'event_monitor':
        return <EventMonitorPage />;
      case 'strategy':
        return <StrategyPage />;
      case 'token_intelligence':
        return <TokenIntelligencePage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <OverviewPage />;
    }
  };

  return (
    <div className="min-h-screen bg-[#070707] text-white flex flex-col font-sans relative selection:bg-white/20">
      {/* Subtle atmospheric glow in background for frosted glass depth */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[800px] h-[400px] bg-emerald-500/[0.015] rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[700px] h-[400px] bg-purple-500/[0.015] rounded-full blur-[160px]" />
      </div>

      {/* Top Navbar: Full-Width Frosted Glass Bar */}
      <Navbar />

      {/* Main Container: Desktop Left Sidebar + Full-Width Page Viewport */}
      <div className="flex flex-1 min-h-0 relative z-10 w-full overflow-hidden">
        {/* Desktop Sidebar: automatically hidden on mobile screens, persistent on desktop */}
        <aside className="hidden lg:block shrink-0">
          <Sidebar />
        </aside>

        {/* Dynamic Page Viewport: 100% full-width, edge-to-edge, each page in its own unconstrained layout */}
        <main className="flex-1 overflow-y-auto w-full h-[calc(100vh-3.5rem)] pb-28 lg:pb-6 focus:outline-none">
          {renderActiveView()}
        </main>
      </div>

      {/* Slim Mobile Floating Bottom Navigation (automatically visible on mobile viewports) */}
      <div className="lg:hidden">
        <MobileNav />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <TerminalProvider>
      <MainLayout />
    </TerminalProvider>
  );
}
