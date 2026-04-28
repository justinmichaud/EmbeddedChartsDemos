import type { IframeToMainMessage } from '../../types/messages';
import { useData } from '../context/DataContext';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CHF', 'AUD', 'CAD'];
const CHART_COUNTS = [2, 4, 6, 8, 10, 12, 14];

interface SettingsModalProps {
  onClose: () => void;
}

function send(msg: IframeToMainMessage) {
  window.parent.postMessage(msg, '*');
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { currency, numCharts } = useData();

  function setCurrency(c: string) {
    send({ type: 'UPDATE_SETTINGS', settings: { currency: c } });
  }

  function setNumCharts(n: number) {
    send({ type: 'UPDATE_SETTINGS', settings: { numCharts: n } });
  }

  function clearStorage() {
    send({ type: 'CLEAR_STORAGE' });
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="bg-[#1a1f29] border border-[#2d3748] font-mono w-72"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-[#2d3748] flex justify-between items-center">
          <span className="text-[#e6e8eb] font-bold" style={{ fontSize: 11 }}>SETTINGS</span>
          <button
            onClick={onClose}
            className="text-[#6b7280] hover:text-[#e6e8eb]"
            style={{ fontSize: 12 }}
          >
            ✕
          </button>
        </div>

        <div className="p-3 space-y-4">
          {/* Currency */}
          <div>
            <div className="text-[#6b7280] mb-1" style={{ fontSize: 9 }}>CURRENCY</div>
            <div className="grid grid-cols-4 gap-1">
              {CURRENCIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`py-1 text-center transition-colors border ${
                    c === currency
                      ? 'border-[#3b82f6] text-[#3b82f6] bg-[#1e3a5f]'
                      : 'border-[#2d3748] text-[#6b7280] hover:border-[#4b5563] hover:text-[#9ca3af]'
                  }`}
                  style={{ fontSize: 9 }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Num charts */}
          <div>
            <div className="text-[#6b7280] mb-1" style={{ fontSize: 9 }}>CHARTS DISPLAYED</div>
            <div className="grid grid-cols-7 gap-1">
              {CHART_COUNTS.map(n => (
                <button
                  key={n}
                  onClick={() => setNumCharts(n)}
                  className={`py-1 text-center transition-colors border ${
                    n === numCharts
                      ? 'border-[#3b82f6] text-[#3b82f6] bg-[#1e3a5f]'
                      : 'border-[#2d3748] text-[#6b7280] hover:border-[#4b5563] hover:text-[#9ca3af]'
                  }`}
                  style={{ fontSize: 9 }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Reset */}
          <div className="pt-2 border-t border-[#2d3748]">
            <button
              onClick={clearStorage}
              className="w-full py-1.5 border border-[#ef4444] text-[#ef4444] hover:bg-[#ef4444] hover:text-white transition-colors"
              style={{ fontSize: 9 }}
            >
              CLEAR LOCAL STORAGE &amp; RESET
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
