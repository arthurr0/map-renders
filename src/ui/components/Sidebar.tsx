import { BackgroundSection } from '../sections/BackgroundSection';
import { BlocksSection } from '../sections/BlocksSection';
import { GradingSection } from '../sections/GradingSection';
import { PostFxSection } from '../sections/PostFxSection';
import {
  CameraSection,
  EffectsSection,
  GroundSection,
  LightingSection,
  PresetsSection,
} from '../sections/SettingsSections';
import { SkySection } from '../sections/SkySection';
import { TexturesSection } from '../sections/TexturesSection';
import { WaterSection } from '../sections/WaterSection';
import { useAppStore } from '../store';
import { IconButton } from './Icon';

export function Sidebar() {
  const open = useAppStore((state) => state.leftDrawerOpen);
  const setOpen = useAppStore((state) => state.setLeftDrawerOpen);
  const reset = useAppStore((state) => state.resetSettings);
  return (
    <aside className={`app-sidebar drawer${open ? ' open' : ''}`} aria-label="Settings">
      <div className="panel-header">
        <h2>Settings</h2>
        <button type="button" className="link-button" onClick={reset}>
          Reset
        </button>
        <IconButton
          icon="close"
          label="Close settings"
          className="drawer-close"
          onClick={() => setOpen(false)}
        />
      </div>
      <PresetsSection />
      <TexturesSection />
      <BackgroundSection />
      <SkySection />
      <GroundSection />
      <WaterSection />
      <LightingSection />
      <EffectsSection />
      <PostFxSection />
      <GradingSection />
      <CameraSection />
      <BlocksSection />
    </aside>
  );
}
