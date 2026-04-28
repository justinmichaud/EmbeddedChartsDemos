import { useState } from 'react';
import { DataProvider, useData } from './context/DataContext';
import { MenuBar } from './components/MenuBar';
import { NewsView } from './components/NewsView';
import { StockGrid } from './components/StockGrid';
import { ChartDetail } from './components/ChartDetail';
import { SettingsModal } from './components/SettingsModal';

const detailStock = new URLSearchParams(window.location.search).get('stock');

function SweepOverlay() {
  const { sweepPos } = useData();
  const pct = sweepPos * 100;
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: `linear-gradient(to right,
          rgba(59,130,246,0.07) 0%,
          rgba(59,130,246,0.07) calc(${pct}% - 1px),
          rgba(99,179,237,0.55) calc(${pct}% - 1px),
          rgba(99,179,237,0.55) ${pct}%,
          transparent ${pct}%)`,
      }}
    />
  );
}

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <DataProvider>
      <div className="size-full bg-[#0f1419] flex flex-col overflow-hidden">
        <MenuBar onSettingsClick={() => setSettingsOpen(true)} />

        {detailStock ? (
          <ChartDetail symbol={detailStock} />
        ) : (
          <div className="flex-1 overflow-auto flex flex-col gap-2 py-2 relative">
            <SweepOverlay />
            <NewsView />
            <StockGrid />
          </div>
        )}

        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </div>
    </DataProvider>
  );
}
