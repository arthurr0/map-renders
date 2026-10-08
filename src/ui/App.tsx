import { useAppStore } from './store';

export function App() {
  const fileName = useAppStore((state) => state.fileName);
  const shots = useAppStore((state) => state.shots);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Map Renders</h1>
        <span className="app-file">{fileName ?? 'No schematic loaded'}</span>
      </header>
      <aside className="app-sidebar">
        <h2>Settings</h2>
      </aside>
      <main className="app-viewport">
        <div className="viewport-placeholder">Drop a schematic here</div>
      </main>
      <aside className="app-shots">
        <h2>Shots</h2>
        <span>{shots.length} saved</span>
      </aside>
    </div>
  );
}
