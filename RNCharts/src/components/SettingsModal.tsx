import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { C, MONO } from '../theme';
import { state } from '../simulation';
import { updateSettings, resetAll } from '../store';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CHF', 'AUD', 'CAD'];
const CHART_COUNTS = [2, 4, 8, 14, 20, 30, 40, 50];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { currency, numCharts } = state.settings;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={styles.title}>SETTINGS</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.section}>CURRENCY</Text>
            <View style={styles.gridWrap}>
              {CURRENCIES.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={c === currency}
                  onPress={() => updateSettings({ currency: c })}
                />
              ))}
            </View>

            <Text style={[styles.section, { marginTop: 16 }]}>CHARTS DISPLAYED</Text>
            <View style={styles.gridWrap}>
              {CHART_COUNTS.map((n) => (
                <Chip
                  key={n}
                  label={String(n)}
                  active={n === numCharts}
                  onPress={() => updateSettings({ numCharts: n })}
                />
              ))}
            </View>

            <TouchableOpacity
              style={styles.reset}
              onPress={() => {
                resetAll();
                onClose();
              }}
            >
              <Text style={styles.resetText}>CLEAR LOCAL STORAGE &amp; RESET</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
    >
      <Text style={[styles.chipText, { color: active ? C.blue : C.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  panel: { width: 288, backgroundColor: C.panel, borderWidth: 1, borderColor: C.border },
  head: {
    paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  title: { fontFamily: MONO, color: C.text, fontWeight: '700', fontSize: 11 },
  close: { fontFamily: MONO, color: C.textMuted, fontSize: 14 },
  body: { padding: 12 },
  section: { fontFamily: MONO, color: C.textMuted, fontSize: 9, marginBottom: 4 },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { width: 60, paddingVertical: 4, borderWidth: 1, alignItems: 'center' },
  chipActive: { borderColor: C.blue, backgroundColor: C.blueDim },
  chipIdle: { borderColor: C.border },
  chipText: { fontFamily: MONO, fontSize: 9 },
  reset: {
    marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border,
    borderWidth: 1, borderColor: C.red, paddingVertical: 6, alignItems: 'center',
  },
  resetText: { fontFamily: MONO, color: C.red, fontSize: 9 },
});
