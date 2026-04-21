import { useData } from '../context/DataContext';

export function NewsView() {
  const { headlines, newsIndex } = useData();

  if (!headlines.length) return null;

  // Show 3 most recent headlines rotating from newsIndex
  const visible = [0, 1, 2].map(offset => {
    const i = (newsIndex - offset + headlines.length) % headlines.length;
    return { text: headlines[i], age: offset };
  });

  return (
    <div className="mx-2 border border-[#2d3748] bg-[#1a1f29] shrink-0">
      <div className="px-2 py-0.5 border-b border-[#2d3748] flex items-center gap-2">
        <span className="text-[#3b82f6] font-mono font-bold" style={{ fontSize: 9 }}>NEWSFEED</span>
        <span className="text-[#6b7280] font-mono" style={{ fontSize: 8 }}>LIVE</span>
      </div>
      <div className="divide-y divide-[#2d3748]">
        {visible.map(({ text, age }) => (
          <div key={text} className="px-2 py-1 flex items-center gap-2">
            <span
              className="font-mono shrink-0"
              style={{ fontSize: 8, color: age === 0 ? '#e6e8eb' : '#6b7280' }}
            >
              {age === 0 ? '▶' : ' '}
            </span>
            <span
              className="font-mono"
              style={{ fontSize: 9, color: age === 0 ? '#d1d5db' : '#6b7280' }}
            >
              {text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
