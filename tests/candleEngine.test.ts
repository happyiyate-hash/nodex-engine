import test from 'node:test';
import assert from 'node:assert/strict';
import { CandleEngine, isUnixTimestampMilliseconds } from '../src/services/candleEngine';

const base = 1_730_000_000_000;
function trade(signature: string, timestamp_ms: number, price: number, volume = 1, event_index = 0) {
  return { signature, event_index, timestamp_ms, price_usd: price, volume_usd: volume };
}

test('timestamp boundary accepts epoch milliseconds and rejects seconds or invalid values', () => {
  assert.equal(isUnixTimestampMilliseconds(base), true);
  assert.equal(isUnixTimestampMilliseconds(Math.floor(base / 1000)), false);
  assert.equal(isUnixTimestampMilliseconds(0), false);
  assert.equal(isUnixTimestampMilliseconds(Number.NaN), false);
  assert.equal(isUnixTimestampMilliseconds(8_640_000_000_000_001), false);
});

test('CandleEngine rejects seconds accidentally supplied as milliseconds', () => {
  const engine = new CandleEngine();
  assert.equal(engine.addTrade(trade('seconds', Math.floor(base / 1000), 10)), false);
  assert.deepEqual(engine.getPoints('1S'), []);
});

test('multiple trades in one bucket update one OHLCV candle', () => {
  const engine = new CandleEngine();
  assert.equal(engine.addTrade(trade('first', base + 100, 10, 2)), true);
  assert.equal(engine.addTrade(trade('second', base + 700, 12, 3)), true);
  assert.equal(engine.addTrade(trade('third', base + 900, 9, 4)), true);
  assert.deepEqual(engine.getPoints('1S'), [{ timestamp_ms: base, open: 10, high: 12, low: 9, close: 9, volume: 9 }]);
});

test('duplicate trades do not double count volume or mutate OHLCV', () => {
  const engine = new CandleEngine();
  const tick = trade('same-signature', base + 100, 10, 2, 1);
  assert.equal(engine.addTrade(tick), true);
  assert.equal(engine.addTrade(tick), false);
  assert.equal(engine.getPoints('1S')[0].volume, 2);
});

test('late trades correct older buckets while returned candles stay chronological', () => {
  const engine = new CandleEngine();
  engine.addTrade(trade('later', base + 2_100, 12, 1));
  engine.addTrade(trade('earlier', base + 100, 8, 2));
  engine.addTrade(trade('middle', base + 1_100, 10, 3));
  const points = engine.getPoints('1S');
  assert.deepEqual(points.map(point => point.timestamp_ms), [base, base + 1_000, base + 2_000]);
  assert.deepEqual(points.map(point => point.close), [8, 10, 12]);
});

test('timeframe buckets align to interval boundaries', () => {
  const engine = new CandleEngine();
  engine.addTrade(trade('five-second', base + 4_999, 10));
  assert.equal(engine.getPoints('5S')[0].timestamp_ms, Math.floor((base + 4_999) / 5_000) * 5_000);
});
