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
  private simulationTimers: any[] = [];
  private simulatedAssets = [
    { sym: 'NSOL', mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', price: 0.03896 },
    { sym: 'AURA', mint: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', price: 0.07952 },
    { sym: 'CYBER', mint: '3uV91KbxPZqm4ErtJvL8Fz9Mkw77YtQwXbNm21VfPtLq', price: 0.0142 },
    { sym: 'QDOGE', mint: '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', price: 0.00804 },
    { sym: 'VELO', mint: '6jLq88PfWvZb33TrNm44KxJp99QrLt22MkWx88Vb55Yt', price: 0.0048 },
    { sym: 'SMTX', mint: '5oNDL3swdJJF1g9DA6JwguL1pnTXjg9bfjgUjF42UWJb', price: 0.0563 },
  ];
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
    this.stopSimulation();

    // Independent demo streams: price ticks, discovery, and system activity
    // run on separate clocks so one slow stream never blocks another.
    this.simulationTimers.push(setInterval(() => {
      if (!this.isPaused) this.simulatePriceTick();
    }, 850));

    this.simulationTimers.push(setInterval(() => {
      if (!this.isPaused) this.simulateTokenDiscovery();
    }, 5200));

    this.simulationTimers.push(setInterval(() => {
      if (!this.isPaused) this.simulateActivityEvent();
    }, 1350));

    this.simulationTimers.push(setInterval(() => {
      if (!this.isPaused) {
        this.setStatus('connected', 10 + Math.floor(Math.random() * 18));
      }
    }, 2400));
  }

  private simulatePriceTick(): void {
    if (this.simulatedAssets.length === 0) return;
    const asset = this.simulatedAssets[Math.floor(Math.random() * this.simulatedAssets.length)];
    const oldPrice = asset.price;
    const deltaPct = (Math.random() * 0.7) - 0.32;
    const newPrice = Math.max(0.0000001, oldPrice * (1 + deltaPct));
    asset.price = Number(newPrice.toPrecision(8));

    const event: NodeXEvent = {
      event_id: 'evt_tick_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      event_type: 'price_updated',
      timestamp: new Date().toISOString(),
      token_mint: asset.mint,
      message: asset.sym + ' price tick: $' + asset.price.toFixed(7) + ' (' + (deltaPct >= 0 ? '+' : '') + (deltaPct * 100).toFixed(2) + '%)',
      processing_status: 'processed',
      data: {
        symbol: asset.sym,
        token_mint: asset.mint,
        old_price_usd: oldPrice,
        new_price_usd: asset.price,
        price_change_pct: Number((deltaPct * 100).toFixed(3)),
        venue: 'pump.fun',
        slot: 309482000 + Math.floor(Math.random() * 5000),
        simulated: true,
      },
    };
    this.dispatch(event);
  }

  private simulateActivityEvent(): void {
    if (this.simulatedAssets.length === 0) return;
    const asset = this.simulatedAssets[Math.floor(Math.random() * this.simulatedAssets.length)];
    const roll = Math.random();
    const now = new Date().toISOString();
    let event: NodeXEvent;

    if (roll < 0.55) {
      const liquidityChange = (Math.random() * 1.4 - 0.65) / 100;
      event = {
        event_id: 'evt_liq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        event_type: 'liquidity_updated',
        timestamp: now,
        token_mint: asset.mint,
        message: asset.sym + ' liquidity pool update: ' + (liquidityChange >= 0 ? '+' : '') + (liquidityChange * 100).toFixed(2) + '%',
        processing_status: 'processed',
        data: { symbol: asset.sym, token_mint: asset.mint, change_pct: Number((liquidityChange * 100).toFixed(2)), simulated: true },
      };
    } else if (roll < 0.82) {
      event = {
        event_id: 'evt_safety_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        event_type: 'safety_check_completed',
        timestamp: now,
        token_mint: asset.mint,
        message: asset.sym + ' periodic safety monitor check completed',
        processing_status: 'processed',
        data: { symbol: asset.sym, token_mint: asset.mint, safety_score: 80 + Math.floor(Math.random() * 20), simulated: true },
      };
    } else {
      event = {
        event_id: 'evt_signal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        event_type: 'buy_signal_generated',
        timestamp: now,
        token_mint: asset.mint,
        message: 'Momentum monitor refreshed for $' + asset.sym + ' — paper strategy evaluating entry conditions',
        processing_status: 'analyzing',
        data: { symbol: asset.sym, token_mint: asset.mint, confidence_score: Number((0.65 + Math.random() * 0.3).toFixed(2)), simulated: true },
      };
    }
    this.dispatch(event);
  }

  private simulateTokenDiscovery(): void {
    const prefixes = ['Sol', 'Hyper', 'Nova', 'Apex', 'Neon', 'Aura', 'Zero', 'Alpha', 'Quantum', 'Vertex'];
    const suffixes = ['AI', 'X', 'Vault', 'Pump', 'Bot', 'Speed', 'Core', 'Net', 'Labs', 'Chain'];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    const name = p + ' ' + s;
    const symbol = (p.substring(0, 3) + s.substring(0, 2)).toUpperCase();
    const randChars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let mint = '';
    for (let i = 0; i < 44; i++) mint += randChars.charAt(Math.floor(Math.random() * randChars.length));

    const price = Number((Math.random() * 0.04 + 0.005).toFixed(7));
    const liquidity = Math.round(10000 + Math.random() * 45000);
    const score = Math.round(45 + Math.random() * 52);
    this.simulatedAssets.push({ sym: symbol, mint, price });
    if (this.simulatedAssets.length > 60) this.simulatedAssets.splice(6, 1);

    const event: NodeXEvent = {
      event_id: 'evt_disc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      event_type: 'new_token_detected',
      timestamp: new Date().toISOString(),
      token_mint: mint,
      message: 'DEMO DISCOVERY: detected $' + symbol + ' [' + name + '] via simulated Pump.fun stream',
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
        creator_wallet: mint.substring(0, 6) + '...' + mint.substring(mint.length - 4),
        simulated: true,
      },
    };
    this.dispatch(event);
  }

  private stopSimulation(): void {
    this.simulationTimers.forEach((timer) => clearInterval(timer));
    this.simulationTimers = [];
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
