import { useRef } from 'react';
import { Section, Segmented, Toggle } from '../components/controls';
import { Icon } from '../components/Icon';
import { applyBundledPack, applyZipPack } from '../pipeline';
import { useAppStore } from '../store';

export function TexturesSection() {
  const textureMode = useAppStore((state) => state.settings.textureMode);
  const ao = useAppStore((state) => state.settings.ambientOcclusionVertex);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const packSource = useAppStore((state) => state.packSource);
  const packName = useAppStore((state) => state.packName);
  const packLoading = useAppStore((state) => state.packLoading);
  const setCreditsOpen = useAppStore((state) => state.setCreditsOpen);
  const input = useRef<HTMLInputElement>(null);

  return (
    <Section id="textures" title="Textures" defaultOpen>
      <Segmented
        label="Texture mode"
        value={textureMode}
        options={[
          { value: 'textured', label: 'Textured' },
          { value: 'simplified', label: 'Simplified' },
        ]}
        onChange={(value) => updateSettings({ textureMode: value })}
      />
      <Toggle
        label="Vertex ambient occlusion"
        checked={ao}
        onChange={(value) => updateSettings({ ambientOcclusionVertex: value })}
      />
      <div className="subheading">Resource pack</div>
      <Segmented
        label="Resource pack source"
        value={packSource}
        options={[
          { value: 'bundled', label: 'Pixel Perfection' },
          { value: 'zip', label: 'Upload zip' },
        ]}
        onChange={(value) => {
          if (value === 'bundled') void applyBundledPack();
          else input.current?.click();
        }}
      />
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        hidden
        data-testid="pack-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void applyZipPack(file);
        }}
      />
      <button
        type="button"
        className="wide"
        disabled={packLoading}
        onClick={() => input.current?.click()}
      >
        <Icon name="upload" size={16} />
        {packLoading ? 'Loading pack' : 'Choose pack zip'}
      </button>
      <p className="note">
        {packSource === 'zip' && packName
          ? `Using ${packName} on top of the bundled pack. Missing textures fall back to Pixel Perfection.`
          : 'Active pack: Pixel Perfection by XSSheep, CC BY-SA 4.0.'}
      </p>
      <button
        type="button"
        className="link-button align-start"
        onClick={() => setCreditsOpen(true)}
      >
        Credits and licenses
      </button>
    </Section>
  );
}
