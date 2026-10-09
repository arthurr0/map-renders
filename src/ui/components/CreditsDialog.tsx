import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { IconButton } from './Icon';
import { useDialogFocus } from './useDialogFocus';

interface HdriCredit {
  name: string;
  author: string;
  url: string;
}

const HDRI_CREDITS: HdriCredit[] = [
  { name: 'Meadow 2', author: 'Sergej Majboroda', url: 'https://polyhaven.com/a/meadow_2' },
  {
    name: 'Kloofendal Overcast (Pure Sky)',
    author: 'Greg Zaal',
    url: 'https://polyhaven.com/a/kloofendal_overcast_puresky',
  },
  { name: 'Venice Sunset', author: 'Greg Zaal', url: 'https://polyhaven.com/a/venice_sunset' },
  {
    name: 'Studio Small 09',
    author: 'Sergej Majboroda',
    url: 'https://polyhaven.com/a/studio_small_09',
  },
];

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function CreditsDialog() {
  const open = useAppStore((state) => state.creditsOpen);
  const setOpen = useAppStore((state) => state.setCreditsOpen);
  const packSource = useAppStore((state) => state.packSource);
  const packName = useAppStore((state) => state.packName);
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialog);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={() => setOpen(false)}>
      <div
        className="dialog credits-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-title"
        tabIndex={-1}
        ref={dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 id="credits-title">Credits</h2>
          <IconButton icon="close" label="Close credits" onClick={() => setOpen(false)} />
        </div>
        <div className="dialog-body credits-body">
          {packSource === 'zip' && packName && (
            <section className="credits-section">
              <h3>Your resource pack</h3>
              <p>
                The pack {packName} is supplied by you and is not part of this app. Textures missing
                from it fall back to Pixel Perfection.
              </p>
            </section>
          )}
          <section className="credits-section">
            <h3>Texture pack</h3>
            <p>
              Pixel Perfection by XSSheep (Hugh Rutland), licensed under{' '}
              <ExternalLink href="https://creativecommons.org/licenses/by-sa/4.0/">
                CC BY-SA 4.0
              </ExternalLink>
              .
            </p>
            <p>
              <ExternalLink href="https://www.minecraftforum.net/forums/mapping-and-modding-java-edition/resource-packs/1242533-pixel-perfection-now-with-polar-bears-1-11">
                Original pack on the Minecraft Forum
              </ExternalLink>
            </p>
            <p>
              Updated for newer Minecraft versions by Nova Wostra (
              <ExternalLink href="https://modrinth.com/resourcepack/pixel-perfection-legacy">
                Pixel Perfection Legacy
              </ExternalLink>
              ), with contributions from freejusticehere and HexaBlu.
            </p>
            <p>
              Modifications: only block textures and a few entity textures (chests, beds, signs,
              bell, decorated pot, mob heads, end portal) were kept, emissive shader variants were
              removed, animation metadata was merged into a manifest, and the files are served
              individually. The bundled textures stay under CC BY-SA 4.0.
            </p>
          </section>
          <section className="credits-section">
            <h3>HDRI lighting</h3>
            <p>
              Environment maps come from Poly Haven and are released under{' '}
              <ExternalLink href="https://creativecommons.org/publicdomain/zero/1.0/">
                CC0 1.0
              </ExternalLink>
              . No attribution is required, the credits are given as a courtesy. See the{' '}
              <ExternalLink href="https://polyhaven.com/license">Poly Haven license</ExternalLink>.
            </p>
            <ul className="credits-list">
              {HDRI_CREDITS.map((hdri) => (
                <li key={hdri.url}>
                  <ExternalLink href={hdri.url}>{hdri.name}</ExternalLink>
                  <span>{hdri.author}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
