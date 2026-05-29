import { useEffect, useState } from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { C } from './src/theme';
import { boot, useTick } from './src/store';
import { MenuBar } from './src/components/MenuBar';
import { StockGrid } from './src/components/StockGrid';
import { ChartDetail } from './src/components/ChartDetail';
import { SettingsModal } from './src/components/SettingsModal';
import { SweepOverlay } from './src/components/SweepOverlay';

export default function App() {
  const [ready, setReady] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Boot the simulation once (loads persisted settings, starts the 5 Hz loop).
  useEffect(() => {
    boot().then(() => setReady(true));
  }, []);

  // Single subscription: one re-render per tick drives the whole tree.
  const tick = useTick();

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <MenuBar
        onSettings={() => setSettingsOpen(true)}
        onRecover={() => setDetail(null)}
      />

      {detail ? (
        <ChartDetail symbol={detail} onBack={() => setDetail(null)} />
      ) : (
        <View style={styles.body}>
          {ready && <StockGrid onSelect={setDetail} tick={tick} />}
          {/* Rendered last so it paints on top of the grid (matches original). */}
          <SweepOverlay />
        </View>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1 },
});
