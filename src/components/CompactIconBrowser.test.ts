import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import compactIconBrowserSource from './CompactIconBrowser.tsx?raw';
import {
  CompactIconBrowser,
  type CompactIconBrowserGroup,
} from './CompactIconBrowser';

function render(groups: CompactIconBrowserGroup<string>[], selectedId?: string): string {
  return renderToStaticMarkup(
    createElement(CompactIconBrowser<string>, {
      groups,
      selectedId,
      ariaLabel: 'Effect browser',
      onSelect: () => undefined,
      onPreview: () => undefined,
      onDismiss: () => undefined,
    }),
  );
}

const icon = createElement('svg', { 'aria-hidden': true });

describe('CompactIconBrowser', () => {
  it('keeps disclosure groups collapsed until deliberately opened', () => {
    const html = render([
      {
        id: 'legacy',
        label: 'Legacy effects',
        disclosure: true,
        items: [
          {
            id: 'legacy-effect',
            value: 'legacy-effect',
            name: 'Legacy Effect',
            description: 'Kept for old projects.',
            icon,
            badge: 'LEGACY',
          },
        ],
      },
    ]);

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('>Show<');
    expect(html).not.toContain('Legacy Effect');
    expect(html).not.toContain('LEGACY');
  });

  it('renders NEW, META, and LEGACY badges in each option label and tooltip', () => {
    const html = render([
      {
        id: 'effects',
        label: 'Effects',
        items: (['NEW', 'META', 'LEGACY'] as const).map((badge) => ({
          id: badge.toLowerCase(),
          value: badge,
          name: `${badge} effect`,
          description: `${badge} description`,
          cost: 'high',
          icon,
          badge,
        })),
      },
    ]);

    for (const badge of ['NEW', 'META', 'LEGACY']) {
      expect(html).toContain(`compact-icon-browser-badge ${badge.toLowerCase()}`);
      expect(html).toContain(`${badge}. ${badge} effect. ${badge} description`);
    }
  });

  it('marks the selected option and preserves disabled option semantics', () => {
    const html = render(
      [
        {
          id: 'effects',
          label: 'Effects',
          items: [
            {
              id: 'selected',
              value: 'selected',
              name: 'Selected effect',
              description: 'The active choice.',
              icon,
            },
            {
              id: 'disabled',
              value: 'disabled',
              name: 'Disabled effect',
              description: 'Unavailable here.',
              icon,
              disabled: true,
            },
          ],
        },
      ],
      'selected',
    );

    expect(html).toContain('class="selected" role="option" aria-selected="true"');
    expect(html).toContain('role="option" aria-selected="false"');
    expect(html).toContain('disabled=""');
  });

  it('keeps the keyboard helper dismissible and skips disabled focus candidates', () => {
    expect(compactIconBrowserSource).toContain("if (event.key === 'Escape')");
    expect(compactIconBrowserSource).toContain('onDismiss?.();');
    expect(compactIconBrowserSource).toContain("event.key === 'Home'");
    expect(compactIconBrowserSource).toContain("event.key === 'End'");
    expect(compactIconBrowserSource).toContain('candidate.button && !candidate.button.disabled');
  });
});
