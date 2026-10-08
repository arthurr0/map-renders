import { useMemo, useState } from 'react';
import { prettyBlockName } from '../blockStats';
import { Section } from '../components/controls';
import { useAppStore } from '../store';

const GLASS = /glass|ice/;

export function BlocksSection() {
  const counts = useAppStore((state) => state.blockStats.counts);
  const hidden = useAppStore((state) => state.meshOptions.hideBlocks);
  const setHideBlocks = useAppStore((state) => state.setHideBlocks);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? counts.filter((entry) => entry.name.toLowerCase().includes(needle)) : counts;
  }, [counts, query]);

  const toggle = (name: string) => {
    setHideBlocks(hidden.includes(name) ? hidden.filter((n) => n !== name) : [...hidden, name]);
  };

  const hideGlass = () => {
    const glass = counts.filter((entry) => GLASS.test(entry.name)).map((entry) => entry.name);
    setHideBlocks([...new Set([...hidden, ...glass])]);
  };

  return (
    <Section id="blocks" title={`Blocks${hidden.length ? ` (${hidden.length} hidden)` : ''}`}>
      {counts.length === 0 ? (
        <p className="note">Open a schematic to see its blocks.</p>
      ) : (
        <>
          <input
            type="search"
            placeholder="Filter blocks"
            aria-label="Filter blocks"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="chips">
            <button type="button" className="chip" onClick={hideGlass}>
              Hide glass
            </button>
            <button
              type="button"
              className="chip"
              disabled={hidden.length === 0}
              onClick={() => setHideBlocks([])}
            >
              Show all
            </button>
          </div>
          <ul className="block-list">
            {visible.map((entry) => (
              <li key={entry.name}>
                <label>
                  <input
                    type="checkbox"
                    checked={hidden.includes(entry.name)}
                    onChange={() => toggle(entry.name)}
                  />
                  <span className="block-name" title={entry.name}>
                    {prettyBlockName(entry.name)}
                  </span>
                  <span className="block-count">{entry.count.toLocaleString()}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="note">Checked blocks are hidden from the model.</p>
        </>
      )}
    </Section>
  );
}
