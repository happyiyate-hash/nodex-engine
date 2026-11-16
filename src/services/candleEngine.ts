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

type CandleBucket = {
  point: CandlePoint;
  firstTrade: NormalizedTrade;
  lastTrade: NormalizedTrade;
};

const MAX_CANDLES_PER_TIMEFRAME = 5_000;

/** Frontend chart timestamps are Unix epoch milliseconds, never seconds. */
export function isUnixTimestampMilliseconds(value: number): boolean {
  return Number.isFinite(value) && value >= 100_000_000_000 && value <= 8_640_000_000_000_000;
}
const MAX_SEEN_TRADES = 30_000;

function compareTrades(a: NormalizedTrade, b: NormalizedTrade): number {
  return a.timestamp_ms - b.timestamp_ms ||
    a.event_index - b.event_index ||
    a.id.localeCompare(b.id);
}

/**
 * Builds live OHLCV candles from confirmed swap events in the browser.
 * Each accepted trade updates its timeframe candles in O(1), apart from
 * occasional ordering corrections for late/out-of-order trades.
 * Historical candles can still come from the API as the chart baseline.
 */
export class CandleEngine {
  private seenTradeIds = new Set<string>();
  private seenTradeOrder: string[] = [];
  private candlesByTimeframe = new Map<string, Map<number, CandleBucket>>();

  reset(): void {
    this.seenTradeIds.clear();
    this.seenTradeOrder = [];
    this.candlesByTimeframe.clear();
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
    if (!isUnixTimestampMilliseconds(timestamp) ||
        !Number.isFinite(price) || price <= 0) return false;

    const normalizedEventIndex = Number.isFinite(eventIndex) ? eventIndex : 0;
    const id = trade.signature + ':' + normalizedEventIndex;
    if (this.seenTradeIds.has(id)) return false;

    const normalized: NormalizedTrade = {
      id,
      timestamp_ms: timestamp,
      event_index: normalizedEventIndex,
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
      let buckets = this.candlesByTimeframe.get(timeframe);
      if (!buckets) {
        buckets = new Map<number, CandleBucket>();
        this.candlesByTimeframe.set(timeframe, buckets);
      }

      const current = buckets.get(bucketTime);
      if (!current) {
        buckets.set(bucketTime, {
          point: {
            timestamp_ms: bucketTime,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: normalized.volume,
          },
          firstTrade: normalized,
          lastTrade: normalized,
        });
      } else {
        const point = current.point;
        point.high = Math.max(point.high, price);
        point.low = Math.min(point.low, price);
        point.volume += normalized.volume;

        if (compareTrades(normalized, current.firstTrade) < 0) {
          current.firstTrade = normalized;
          point.open = price;
        }
        if (compareTrades(normalized, current.lastTrade) > 0) {
          current.lastTrade = normalized;
          point.close = price;
        }
      }

      if (buckets.size > MAX_CANDLES_PER_TIMEFRAME) {
        let oldestTimestamp = Number.POSITIVE_INFINITY;
        for (const bucketTimestamp of buckets.keys()) {
          if (bucketTimestamp < oldestTimestamp) oldestTimestamp = bucketTimestamp;
        }
        buckets.delete(oldestTimestamp);
      }
    }

    return true;
  }

  getPoints(timeframe: string): CandlePoint[] {
    const buckets = this.candlesByTimeframe.get(timeframe);
    if (!buckets) return [];

    return [...buckets.values()]
      .map((bucket) => ({ ...bucket.point }))
      .sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  }
}
