export interface ConfirmedTrade {
  signature: string;
  event_index: number;
  side?: string;
  price_usd?: number | null;
  volume_usd?: number | null;
  timestamp_ms: number;
}

export interface CandlePoint {
  timestamp_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const CANDLE_INTERVALS: Record<string, number> = {
  '1S': 1_000,
  '5S': 5_000,
  '10S': 10_000,
  '1M': 60_000,
  '5M': 300_000,
  '15M': 900_000,
  '30M': 1_800_000,
  '1H': 3_600_000,
  '24H': 86_400_000,
};

type NormalizedTrade = {
  id: string;
  timestamp_ms: number;
  event_index: number;
  price: number;
  volume: number;
};

const MAX_CANDLES_PER_TIMEFRAME = 5_000;
const MAX_SEEN_TRADES = 30_000;

/**
 * Builds live OHLCV candles from confirmed swap events in the browser.
 * Historical candles can still come from the API; these local candles take
 * precedence for buckets that contain trades received by this client.
 */
export class CandleEngine {
  private seenTradeIds = new Set<string>();
  private seenTradeOrder: string[] = [];
  private tradesByTimeframe = new Map<string, Map<number, NormalizedTrade[]>>();

  reset(): void {
    this.seenTradeIds.clear();
    this.seenTradeOrder = [];
    this.tradesByTimeframe.clear();
  }

  addTrades(trades: ConfirmedTrade[]): void {
    for (const trade of trades) this.addTrade(trade);
  }

  addTrade(trade: ConfirmedTrade): boolean {
    if (!trade || typeof trade.signature !== 'string' || !trade.signature) return false;

    const eventIndex = Number(trade.event_index ?? 0);
    const timestamp = Number(trade.timestamp_ms);
    const price = Number(trade.price_usd);
    const rawVolume = Number(trade.volume_usd ?? 0);
    if (!Number.isFinite(timestamp) || timestamp <= 0 ||
        !Number.isFinite(price) || price <= 0) return false;

    const id = trade.signature + ':' + (Number.isFinite(eventIndex) ? eventIndex : 0);
    if (this.seenTradeIds.has(id)) return false;

    const normalized: NormalizedTrade = {
      id,
      timestamp_ms: timestamp,
      event_index: Number.isFinite(eventIndex) ? eventIndex : 0,
      price,
      volume: Number.isFinite(rawVolume) && rawVolume > 0 ? rawVolume : 0,
    };

    this.seenTradeIds.add(id);
    this.seenTradeOrder.push(id);
    if (this.seenTradeOrder.length > MAX_SEEN_TRADES) {
      const expired = this.seenTradeOrder.shift();
      if (expired) this.seenTradeIds.delete(expired);
    }

    for (const [timeframe, interval] of Object.entries(CANDLE_INTERVALS)) {
      const bucketTime = Math.floor(timestamp / interval) * interval;
      let buckets = this.tradesByTimeframe.get(timeframe);
      if (!buckets) {
        buckets = new Map<number, NormalizedTrade[]>();
        this.tradesByTimeframe.set(timeframe, buckets);
      }
      const bucketTrades = buckets.get(bucketTime) || [];
      bucketTrades.push(normalized);
      buckets.set(bucketTime, bucketTrades);

      if (buckets.size > MAX_CANDLES_PER_TIMEFRAME) {
        const oldest = Math.min(...buckets.keys());
        buckets.delete(oldest);
      }
    }
    return true;
  }

  getPoints(timeframe: string): CandlePoint[] {
    const buckets = this.tradesByTimeframe.get(timeframe);
    if (!buckets) return [];
    const points: CandlePoint[] = [];

    for (const [timestamp_ms, bucketTrades] of buckets) {
      const ordered = [...bucketTrades].sort((a, b) =>
        a.timestamp_ms - b.timestamp_ms ||
        a.event_index - b.event_index ||
        a.id.localeCompare(b.id)
      );
      if (ordered.length === 0) continue;

      let high = ordered[0].price;
      let low = ordered[0].price;
      let volume = 0;
      for (const trade of ordered) {
        high = Math.max(high, trade.price);
        low = Math.min(low, trade.price);
        volume += trade.volume;
      }

      points.push({
        timestamp_ms,
        open: ordered[0].price,
        high,
        low,
        close: ordered[ordered.length - 1].price,
        volume,
      });
    }

    return points.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  }
}
