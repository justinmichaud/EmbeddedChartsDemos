import { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C, MONO } from '../theme';
import {
  HISTORY_LEN,
  stockMid,
  stockBid,
  stockAsk,
  stockHead,
  STOCK_SYMBOLS,
} from '../simulation';

const PAD_TOP = 4, PAD_RIGHT = 32, PAD_BOTTOM = 4, PAD_LEFT = 4;
const X_TICK_IDX = [0, 15, 30, 45];

interface Props {
  index: number;
  width: number;
  currency: string;
  enlarged?: boolean;
  onPress?: () => void;
}

// The static "chrome": dashed grid + solid axis lines + axis-label texts.
// Memoized on (width, chartH, yLo, yHi). Thanks to the Y-domain hysteresis in
// StockChart, yLo/yHi stay byte-identical across most ticks, so this whole
// subtree's element identity is reused and React + react-native-svg skip it
// entirely — only the data paths below update per tick. This is the RN analog
// of the original's memoized <ChartOverlay/>.
function ChartChrome({ width, chartH, yLo, yHi }: { width: number; chartH: number; yLo: number; yHi: number }) {
  const plotW = width - PAD_LEFT - PAD_RIGHT;
  const plotH = chartH - PAD_TOP - PAD_BOTTOM;
  const yRange = yHi - yLo || 1;
  const xAt = (i: number) => PAD_LEFT + plotW * (i / (HISTORY_LEN - 1));
  const yAt = (v: number) => PAD_TOP + plotH * (1 - (v - yLo) / yRange);
  const yVals = [0, 1, 2, 3, 4].map((k) => yLo + (yRange * k) / 4);

  // One path for all dashed grid lines, one for the two solid axis lines.
  let gridD = '';
  for (const v of yVals) { const y = yAt(v).toFixed(1); gridD += `M${PAD_LEFT} ${y}L${(PAD_LEFT + plotW).toFixed(1)} ${y}`; }
  for (const idx of X_TICK_IDX) { const x = xAt(idx).toFixed(1); gridD += `M${x} ${PAD_TOP}L${x} ${(PAD_TOP + plotH).toFixed(1)}`; }
  const axesD =
    `M${(PAD_LEFT + plotW).toFixed(1)} ${PAD_TOP}L${(PAD_LEFT + plotW).toFixed(1)} ${(PAD_TOP + plotH).toFixed(1)}` +
    `M${PAD_LEFT} ${(PAD_TOP + plotH).toFixed(1)}L${(PAD_LEFT + plotW).toFixed(1)} ${(PAD_TOP + plotH).toFixed(1)}`;

  return (
    <>
      <Svg width={width} height={chartH} style={StyleSheet.absoluteFill}>
        <Path d={gridD} stroke={C.grid} strokeOpacity={0.4} strokeDasharray="3 3" fill="none" />
        <Path d={axesD} stroke={C.grid} fill="none" />
      </Svg>
      {yVals.map((v, i) => (
        <Text key={`y${i}`} style={[styles.axisLabel, { right: 2, top: yAt(v) - 5 }]}>{v.toFixed(1)}</Text>
      ))}
      {X_TICK_IDX.map((idx, i) => (
        <Text key={`x${i}`} style={[styles.axisLabel, { left: xAt(idx) - 8, bottom: 0 }]}>{HISTORY_LEN - idx}s</Text>
      ))}
    </>
  );
}

export function StockChart({ index, width, currency, enlarged, onPress }: Props) {
  const symbol = STOCK_SYMBOLS[index];
  const chartH = enlarged ? 320 : 96;
  const base = index * HISTORY_LEN;
  const head = stockHead[index];

  // Single pass: chronological scan for high/low.
  let high = -Infinity, low = Infinity;
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < HISTORY_LEN; i++) {
    const idx = base + ((head + i) % HISTORY_LEN);
    const a = stockAsk[idx], b = stockBid[idx];
    if (a > high) high = a;
    if (b < low) low = b;
    if (a > yMax) yMax = a;
    if (b < yMin) yMin = b;
  }

  const lastIdx = base + ((head + HISTORY_LEN - 1) % HISTORY_LEN);
  const firstIdx = base + (head % HISTORY_LEN);
  const curAsk = stockAsk[lastIdx];
  const curBid = stockBid[lastIdx];
  const curMid = stockMid[lastIdx];
  const firstMid = stockMid[firstIdx];
  const change = firstMid !== 0 ? ((curMid - firstMid) / firstMid) * 100 : 0;
  const changeColor = change >= 0 ? C.green : C.red;

  // Y-domain hysteresis: only re-snap when data leaves the current range, then
  // pad generously so the next re-snap is far off. Keeps yLo/yHi stable across
  // most ticks → ChartChrome's memo bails and grid/labels don't re-render.
  const yr = useRef({ lo: 0, hi: 0 }).current;
  if (yr.hi <= yr.lo || yMin < yr.lo || yMax > yr.hi) {
    const dr = (yMax - yMin) || Math.max(yMax * 0.001, 1e-6);
    yr.lo = yMin - dr;
    yr.hi = yMax + dr;
  }
  const yLo = yr.lo, yHi = yr.hi;
  const yRange = yHi - yLo || 1;

  const plotW = width - PAD_LEFT - PAD_RIGHT;
  const plotH = chartH - PAD_TOP - PAD_BOTTOM;
  const baseY = PAD_TOP + plotH;
  const xAt = (i: number) => PAD_LEFT + plotW * (i / (HISTORY_LEN - 1));
  const yAt = (v: number) => PAD_TOP + plotH * (1 - (v - yLo) / yRange);

  // Per-tick work: build the three data curves. One pass, three strings.
  let midD = '', askD = '', bidD = '';
  for (let i = 0; i < HISTORY_LEN; i++) {
    const idx = base + ((head + i) % HISTORY_LEN);
    const x = xAt(i).toFixed(1);
    const cmd = i === 0 ? 'M' : 'L';
    midD += `${cmd}${x} ${yAt(stockMid[idx]).toFixed(1)}`;
    askD += `${cmd}${x} ${yAt(stockAsk[idx]).toFixed(1)}`;
    bidD += `${cmd}${x} ${yAt(stockBid[idx]).toFixed(1)}`;
  }
  const baseline = `L${xAt(HISTORY_LEN - 1).toFixed(1)} ${baseY.toFixed(1)}L${xAt(0).toFixed(1)} ${baseY.toFixed(1)}Z`;

  // Memoize the chrome element; identity is stable while yLo/yHi hold.
  const chrome = useMemo(
    () => <ChartChrome width={width} chartH={chartH} yLo={yLo} yHi={yHi} />,
    [width, chartH, yLo, yHi],
  );

  return (
    <Pressable style={[styles.card, { width }]} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.symbol}>{symbol}</Text>
        <Text style={[styles.change, { color: changeColor }]}>
          {change >= 0 ? '+' : ''}{change.toFixed(3)}%
        </Text>
      </View>

      <View style={styles.quoteRow}>
        <Quote label="BID" value={curBid} color={C.red} />
        <Quote label="MID" value={curMid} color={C.text} />
        <Quote label="ASK" value={curAsk} color={C.green} />
        <Quote label="HIGH" value={high} color={C.textDim} />
        <Quote label="LOW" value={low} color={C.textDim} />
      </View>

      <View style={{ height: chartH, backgroundColor: C.bg }}>
        {chrome}
        <Svg width={width} height={chartH} style={StyleSheet.absoluteFill}>
          <Path d={askD + baseline} fill={C.green} fillOpacity={0.12} />
          <Path d={bidD + baseline} fill={C.red} fillOpacity={0.12} />
          <Path d={askD} fill="none" stroke={C.green} strokeWidth={1} />
          <Path d={bidD} fill="none" stroke={C.red} strokeWidth={1} />
          <Path d={midD} fill="none" stroke={C.blue} strokeWidth={enlarged ? 2 : 1.5} />
        </Svg>
      </View>

      <View style={styles.footer}>
        <Text style={styles.foot}><Text style={styles.footDim}>CCY: </Text>{currency}</Text>
        <Text style={styles.foot}><Text style={styles.footDim}>SPR: </Text>${(curAsk - curBid).toFixed(4)}</Text>
        <Text style={styles.foot}><Text style={styles.footDim}>UPD: </Text>5Hz</Text>
      </View>
    </Pressable>
  );
}

function Quote({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.quote}>
      <Text style={styles.quoteLabel}>{label}</Text>
      <Text style={[styles.quoteValue, { color }]}>{value.toFixed(3)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.border },
  header: {
    paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  symbol: { fontFamily: MONO, color: C.text, fontWeight: '600', fontSize: 11 },
  change: { fontFamily: MONO, fontWeight: '600', fontSize: 10 },
  quoteRow: {
    paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.bg,
    borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row',
  },
  quote: { flex: 1 },
  quoteLabel: { fontFamily: MONO, color: C.textMuted, fontSize: 9 },
  quoteValue: { fontFamily: MONO, fontWeight: '600', fontSize: 9 },
  axisLabel: { position: 'absolute', fontFamily: MONO, color: C.textMuted, fontSize: 8 },
  footer: {
    paddingHorizontal: 8, paddingVertical: 4, borderTopWidth: 1, borderTopColor: C.border,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  foot: { fontFamily: MONO, color: C.textDim, fontSize: 8 },
  footDim: { color: C.textMuted },
});
