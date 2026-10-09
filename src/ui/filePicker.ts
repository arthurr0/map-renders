import { loadSchematicFile } from './pipeline';

export const ACCEPTED_EXTENSIONS = ['.schem', '.litematic', '.nbt', '.schematic'];

export function isSupportedFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function openFilePicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPTED_EXTENSIONS.join(',');
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void loadSchematicFile(file);
  };
  input.click();
}
