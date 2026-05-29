import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { StockChart } from './StockChart';
import { STOCK_SYMBOLS, state } from '../simulation';
import { C, MONO } from '../theme';

export function ChartDetail({ symbol, onBack }: { symbol: string; onBack: () => void }) {
  const { width } = useWindowDimensions();
  const index = STOCK_SYMBOLS.indexOf(symbol);

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{symbol} — DETAIL VIEW</Text>
      </View>
      {index >= 0 ? (
        <StockChart index={index} width={width - 16} currency={state.settings.currency} enlarged />
      ) : (
        <Text style={styles.waiting}>Waiting for data…</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 8, gap: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  backBtn: { borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 2 },
  backText: { fontFamily: MONO, color: C.textMuted, fontSize: 10 },
  title: { fontFamily: MONO, color: C.textDim, fontSize: 11 },
  waiting: { fontFamily: MONO, color: C.textMuted, fontSize: 13, padding: 16 },
});
