import { useEffect, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import type { IframeToMainMessage } from '../../types/messages';

function send(msg: IframeToMainMessage) {
  window.parent.postMessage(msg, '*');
}

export function MenuBar({ onSettingsClick }: { onSettingsClick: () => void }) {
  const { currency, lastMessageAge } = useData();
  const [lagOn, setLagOn] = useState(false);

  const [time, setTime] = useState(() => new Date().toLocaleTimeString());
  const [fps, setFps] = useState(0);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  // FPS counter using requestAnimationFrame
  const frameCount = useRef(0);
  const lastFpsTime = useRef(performance.now());
  const rafId = useRef<number>(0);

  useEffect(() => {
    function frame() {
      frameCount.current++;
      const now = performance.now();
      if (now - lastFpsTime.current >= 1000) {
        setFps(frameCount.current);
        frameCount.current = 0;
        lastFpsTime.current = now;
      }
      rafId.current = requestAnimationFrame(frame);
    }
    rafId.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1f29] border-b border-[#2d3748] font-mono shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-[#3b82f6] font-bold" style={{ fontSize: 12 }}>MKTTERM</span>
        <span className="text-[#6b7280]" style={{ fontSize: 10 }}>{time}</span>
        <span className="text-[#6b7280]" style={{ fontSize: 10 }}>
          <span className="text-[#4ade80]">{fps}</span> fps
        </span>
        <span className="text-[#6b7280]" style={{ fontSize: 10 }}>
          lag <span className="text-[#facc15]">{lastMessageAge.toFixed(1)}</span> ms
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[#9ca3af] text-[10px]">{currency}</span>
        <button
          onClick={onSettingsClick}
          className="text-[#6b7280] hover:text-[#e6e8eb] text-[10px] border border-[#2d3748] px-2 py-0.5 hover:border-[#4b5563] transition-colors"
        >
          SETTINGS
        </button>
        <button
          onClick={() => { setLagOn(v => !v); send({ type: 'TOGGLE_LAG' }); }}
          className={`text-[10px] border px-2 py-0.5 transition-colors ${lagOn ? 'border-[#f97316] text-[#f97316]' : 'border-[#2d3748] text-[#6b7280] hover:border-[#f97316] hover:text-[#f97316]'}`}
        >
          {lagOn ? 'LAG ON' : 'LAG'}
        </button>
        <button
          onClick={() => send({ type: 'RECOVER' })}
          className="text-[#6b7280] hover:text-[#ef4444] text-[10px] border border-[#2d3748] px-2 py-0.5 hover:border-[#ef4444] transition-colors"
        >
          RECOVER
        </button>
      </div>
    </div>
  );
}
