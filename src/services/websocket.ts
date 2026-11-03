/**
 * NodeX Real-Time WebSocket & Event Streaming Engine
 * Handles Axum WebSocket connections, automatic reconnection, heartbeats,
 * deduplication, and local Solana paper simulation runtime when backend is offline.
 */

import { ConnectionStatus, DiscoveredToken, EventType, NodeXEvent, Position } from '../types';
import { apiClient } from './api';

type EventListener = (event: NodeXEvent) => void;
type StatusListener = (status: ConnectionStatus, latencyMs: number) => void;

export class NodeXWebSocketService {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private latencyMs = 24;
  private listeners: Set<EventListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  private processedEventIds: Set<string> = new Set();
  private reconnectTimer: any = null;
  private heartbeatTimer: any = null;
  private simulationTimer: any = null;
  private reconnectAttempts = 0;
  private isPaused = false;

  constructor() {
    this.connect();
  }

  public connect(): void {
    const settings = apiClient.getSettings();

    if (settings.mode === 'RUST_BACKEND' && settings.wsUrl) {
      this.initRealWebSocket(settings.wsUrl);
    } else {
      this.initSimulationEngine();
    }
  }

  private initRealWebSocket(url: string): void {
    this.stopSimulation();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
    }

    this.setStatus('reconnecting', 0);

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('connected', 18);
        this.startHeartbeat();
        // Subscribe to all event topics
        this.send({ type: 'subscribe', topics: ['trades', 'tokens', 'positions', 'system'] });
      };

      this.ws.onmessage = (messageEvent) => {
        if (this.isPaused) return;
        try {
          const raw = JSON.parse(messageEvent.data);
          if (raw.type === 'pong') {
            const now = Date.now();
            if (raw.timestamp) {
              this.latencyMs = Math.max(8, now - raw.timestamp);
              this.notifyStatus();
            }
            return;
          }

          if (raw.event_id && !this.processedEventIds.has(raw.event_id)) {
            this.processedEventIds.add(raw.event_id);
            if (this.processedEventIds.size > 2000) {
              const first = Array.from(this.processedEventIds)[0];
              this.processedEventIds.delete(first);
            }
            this.dispatch(raw as NodeXEvent);
          }
        } catch (e) {
          console.warn('Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onerror = () => {
        // Fallback gracefully
        this.setStatus('reconnecting', 0);
      };

      this.ws.onclose = () => {
        this.setStatus('disconnected', 0);
        this.scheduleReconnect();
      };
    } catch {
      this.setStatus('disconnected', 0);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(30000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      const settings = apiClient.getSettings();
      if (settings.mode === 'RUST_BACKEND') {
        this.connect();
      } else {
        this.initSimulationEngine();
      }
    }, delay);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, 5000);
  }

  private initSimulationEngine(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    this.setStatus('connected', 14);
    this.startSimulationStream();
  }

  private startSimulationStream(): void {
    if (this.simulationTimer) clearInterval(this.simulationTimer);

    // Emit live events periodically
    let tickCount = 0;
    this.simulationTimer = setInterval(() => {
      if (this.isPaused) return;
      tickCount++;

      // Every 3 seconds: Price tick on an active position or token
      if (tickCount % 2 === 0) {
        this.simulatePriceTick();
      }

      // Every 9 seconds: New Solana token discovered
      if (tickCount % 5 === 0) {
        this.simulateTokenDiscovery();
      }
    }, 1800);
  }

  private simulatePriceTick(): void {
    const symbols = [
      { sym: 'NSOL', mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', basePrice: 0.03896 },
      { sym: 'AURA', mint: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', basePrice: 0.07952 },
      { sym: 'CYBER', mint: '3uV91KbxPZqm4ErtJvL8Fz9Mkw77YtQwXbNm21VfPtLq', basePrice: 0.0142 },
      { sym: 'QDOGE', mint: '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', basePrice: 0.00804 },
    ];

    const pick = symbols[Math.floor(Math.random() * symbols.length)];
    const deltaPct = (Math.random() * 4 - 1.8) / 100; // -1.8% to +2.2%
    const newPrice = Number(Math.max(0.0001, pick.basePrice * (1 + deltaPct)).toFixed(6));

    const event: NodeXEvent = {
      event_id: `evt_tick_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      event_type: 'price_updated',
      timestamp: new Date().toISOString(),
      token_mint: pick.mint,
      message: `${pick.sym} price tick: $${newPrice} (${deltaPct >= 0 ? '+' : ''}${(deltaPct * 100).toFixed(2)}%)`,
      processing_status: 'processed',
      data: {
        symbol: pick.sym,
        token_mint: pick.mint,
        new_price_usd: newPrice,
        price_change_pct: Number((deltaPct * 100).toFixed(2)),
        venue: 'pump.fun',
        slot: 309482000 + Math.floor(Math.random() * 500),
      },
    };

    this.dispatch(event);
  }

  private simulateTokenDiscovery(): void {
    const prefixes = ['Sol', 'Hyper', 'Nova', 'Apex', 'Neon', 'Aura', 'Zero', 'Alpha'];
    const suffixes = ['AI', 'X', 'Vault', 'Pump', 'Bot', 'Speed', 'Core', 'Net'];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    const name = `${p} ${s}`;
    const symbol = `${p.substring(0, 3).toUpperCase()}${s.substring(0, 2).toUpperCase()}`;

    // Realistic Solana base58-like mint
    const randChars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let mint = '';
    for (let i = 0; i < 44; i++) {
      mint += randChars.charAt(Math.floor(Math.random() * randChars.length));
    }

    const price = Number((Math.random() * 0.04 + 0.005).toFixed(6));
    const liquidity = Math.round(10000 + Math.random() * 45000);
    const score = Math.round(45 + Math.random() * 52);
    const isClean = score >= 80;

    const event: NodeXEvent = {
      event_id: `evt_disc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      event_type: 'new_token_detected',
      timestamp: new Date().toISOString(),
      token_mint: mint,
      message: `Detected $${symbol} [${name}] via Pump.fun on-chain bonding curve`,
      processing_status: 'analyzing',
      data: {
        name,
        symbol,
        token_mint: mint,
        initial_price_usd: price,
        liquidity_usd: liquidity,
        safety_score: score,
        venue: 'pump.fun',
        bonding_curve_progress_pct: Math.round(Math.random() * 40 + 5),
        creator_wallet: `${mint.substring(0, 6)}...${mint.substring(mint.length - 4)}`,
      },
    };

    this.dispatch(event);

    // If it's a high scoring token, trigger simulated buy signal shortly after
    if (isClean && Math.random() > 0.4) {
      setTimeout(() => {
        if (this.isPaused) return;
        const buyEvent: NodeXEvent = {
          event_id: `evt_buy_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          event_type: 'paper_buy_executed',
          timestamp: new Date().toISOString(),
          token_mint: mint,
          message: `Simulated paper buy: $${symbol} for 1.25 SOL ($223.38)`,
          processing_status: 'executed',
          tx_signature: `${mint.substring(0, 10)}...${mint.substring(mint.length - 6)}`,
          data: {
            symbol,
            token_mint: mint,
            entry_price_usd: price,
            amount_sol: 1.25,
            amount_tokens: Math.round(223.38 / price),
            slippage_pct: 0.9,
            execution_latency_ms: 19,
            venue: 'pump.fun',
            status: 'success',
          },
        };
        this.dispatch(buyEvent);
      }, 1200);
    }
  }

  private stopSimulation(): void {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
  }

  public send(payload: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  public getPaused(): boolean {
    return this.isPaused;
  }

  public getStatus(): { status: ConnectionStatus; latencyMs: number } {
    return { status: this.status, latencyMs: this.latencyMs };
  }

  private setStatus(status: ConnectionStatus, latencyMs: number): void {
    this.status = status;
    this.latencyMs = latencyMs;
    this.notifyStatus();
  }

  private notifyStatus(): void {
    this.statusListeners.forEach((fn) => fn(this.status, this.latencyMs));
  }

  public subscribe(fn: EventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public onStatusChange(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    fn(this.status, this.latencyMs);
    return () => this.statusListeners.delete(fn);
  }

  public dispatch(event: NodeXEvent): void {
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('Error in event listener:', err);
      }
    });
  }
}

export const wsService = new NodeXWebSocketService();
