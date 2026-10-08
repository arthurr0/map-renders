import type { HdriEntry } from './store';

function titleCase(id: string): string {
  return id
    .replace(/[_-]+/g, ' ')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeHdriIndex(raw: unknown): HdriEntry[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null
      ? ((): unknown[] => {
          const record = raw as Record<string, unknown>;
          const candidate = record.items ?? record.hdri ?? record.files ?? record.list;
          return Array.isArray(candidate) ? candidate : [];
        })()
      : [];
  const entries: HdriEntry[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      entries.push({ id: item, name: titleCase(item) });
    } else if (typeof item === 'object' && item !== null) {
      const record = item as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id : null;
      if (!id) continue;
      const name = typeof record.name === 'string' ? record.name : titleCase(id);
      entries.push({ id, name });
    }
  }
  return entries;
}

export async function fetchHdriList(): Promise<HdriEntry[]> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}hdri/index.json`);
    if (!response.ok) return [];
    return normalizeHdriIndex(await response.json());
  } catch {
    return [];
  }
}
