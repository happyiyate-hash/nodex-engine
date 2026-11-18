import React, { useEffect, useRef, useState } from 'react';
import { marketDataService } from '../../services/marketData';
import type { TokenDataStreamEvent } from '../../services/marketData';

interface FloatingTrade {
  id: number;
  createdAt: number;
  delayMs: number;
  amount: number;
  side: 'buy' | 'sell';
}

interface FloatingTradeOverlayProps { mint: string; }

const numberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatUsd = (value: number): string => {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 1 ? 4 : 2,
  });
};

/** Dedicated live trade subscription, independent of the Trades tab and history state. */
export const FloatingTradeOverlay: React.FC<FloatingTradeOverlayProps> = ({ mint }) => {
  const [trades, setTrades] = useState<FloatingTrade[]>([]);
  const sequenceRef = useRef(0);
  const nextStartRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let reconnectAttempt = 0;
    const settings = marketDataService.normalizeMarketDataSettings(marketDataService.loadSettings());

    setTrades([]);
    nextStartRef.current = 0;

    const appendTrade = (data: Record<string, unknown>) => {
      const rawSide = String(data.side || '').toLowerCase();
      const side: FloatingTrade['side'] | null = rawSide === 'buy' ? 'buy' : rawSide === 'sell' ? 'sell' : null;
      const volume = numberOrNull(data.volume_usd);
      if (!side || volume === null || volume <= 0) return;

      setTrades((previous) => {
        const now = Date.now();
        const active = previous.filter((item) => item.createdAt + item.delayMs + 3400 > now);
        const startAt = Math.max(now, nextStartRef.current);
        const delayMs = startAt - now;
        nextStartRef.current = startAt + 360;
        return [...active, {
          id: ++sequenceRef.current,
          createdAt: now,
          delayMs,
          amount: volume,
          side,
        }].slice(-24);
      });
    };

    const handleMessage = (message: TokenDataStreamEvent) => {
      if (disposed || (message.mint && message.mint !== mint)) return;
      if (message.event !== 'trade_update' || message.topic !== 'token.trades') return;
      const data = message.data && typeof message.data === 'object'
        ? message.data as Record<string, unknown>
        : {};
      appendTrade(data);
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== undefined || !settings.wsUrl) return;
      const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(reconnectAttempt, 5)));
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        openSocket();
      }, delay);
    };

    const openSocket = () => {
      if (disposed || !settings.wsUrl) return;
      try {
        socket = new WebSocket(settings.wsUrl);
        const activeSocket = socket;
        activeSocket.onopen = () => {
          if (disposed) return;
          try {
            activeSocket.send(JSON.stringify({
              command: 'subscribe',
              mint,
              topics: ['token.trades'],
              timeframe: '1M',
            }));
            reconnectAttempt = 0;
          } catch {
            activeSocket.close();
          }
        };
        activeSocket.onmessage = (event) => {
          try {
            handleMessage(JSON.parse(String(event.data)) as TokenDataStreamEvent);
          } catch {
            // Ignore malformed frames; the next valid trade event remains usable.
          }
        };
        activeSocket.onerror = () => activeSocket.close();
        activeSocket.onclose = () => scheduleReconnect();
      } catch {
        scheduleReconnect();
      }
    };

    if (settings.wsUrl) openSocket();
    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socket?.close(1000, 'Floating trade overlay unmounted');
    };
  }, [mint]);

  useEffect(() => {
    if (trades.length === 0) return;
    const nextExpiry = Math.min(...trades.map((item) => item.createdAt + item.delayMs + 3400));
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setTrades((previous) => previous.filter((item) => item.createdAt + item.delayMs + 3400 > now));
    }, Math.max(0, nextExpiry - Date.now()));
    return () => window.clearTimeout(timer);
  }, [trades]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 13%, black 87%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 13%, black 87%, transparent 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-[112px]"
          style={{
            background:
              'radial-gradient(ellipse 112px 92px at 0% 0%, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.17) 43%, rgba(0,0,0,0) 100%), radial-gradient(ellipse 78px 54px at 0% 52%, rgba(0,0,0,0.105) 0%, rgba(0,0,0,0.045) 52%, rgba(0,0,0,0) 100%)',
          }}
        />
        <style>{`
          @keyframes nodex-money-flow { 0% { transform: translate3d(0,0,0); opacity: 0; } 10% { opacity: .92; } 76% { opacity: .78; } 100% { transform: translate3d(0, calc(0px - var(--trade-travel)), 0); opacity: 0; } }
          @keyframes nodex-money-flow-sell { 0% { transform: translate3d(0,0,0); opacity: 0; } 10%,76% { opacity: 1; } 100% { transform: translate3d(0, calc(0px - var(--trade-travel)), 0); opacity: 0; } }
        `}</style>
        {trades.map((trade) => (
          <span
            key={trade.id}
            className={`absolute whitespace-nowrap font-sans text-[11px] font-light tabular-nums tracking-[-0.02em] [text-shadow:0_1px_4px_rgba(0,0,0,0.48)] ${trade.side === 'buy' ? 'text-[#6CE094]' : 'text-[#FF4D4D]'}`}
            style={{
              left: '10px',
              bottom: '20px',
              animation: trade.side === 'buy'
                ? `nodex-money-flow 3.4s linear ${trade.delayMs}ms both`
                : `nodex-money-flow-sell 3.4s linear ${trade.delayMs}ms both`,
            }}
          >
            <span className="inline-flex items-center gap-[6px]">
              <span className="text-[11px] font-bold leading-none">{trade.side === 'buy' ? '▲' : '▼'}</span>
              {formatUsd(trade.amount)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};
