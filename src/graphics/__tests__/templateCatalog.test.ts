import { TEMPLATES } from '../templates/index.ts';
import { VIEW_OPTIONS } from '../../dashboard/overlayViews.ts';
import { EDITABLE, buildGallery, galleryOrigins } from '../editor/templateCatalog.ts';
import type { BuiltinGraphic } from '../../Themes/registry.ts';

const builtin = (theme: string, view: string): BuiltinGraphic => ({ theme, view, label: view, group: 'On-air', screen: 'on-screen' });

describe('template gallery catalog', () => {
  const builtins = [builtin('Theme1', 'alerts'), builtin('Theme6', 'firstrunnerup'), builtin('Theme2', 'schedule'), builtin('Theme10', 'matchdata')];
  const gallery = buildGallery(TEMPLATES, builtins);
  const all = gallery.flatMap((c) => c.items);

  it('lists every template and built-in exactly once', () => {
    expect(all.length).toBe(TEMPLATES.length + builtins.length);
    expect(new Set(all.map((i) => i.source)).size).toBe(all.length);
  });

  it('gives every slotted entry a real theme slot', () => {
    const keys = new Set(VIEW_OPTIONS.map((v) => v.key));
    for (const item of all) if (item.viewKey) expect(keys.has(item.viewKey)).toBe(true);
  });

  it('files entries under the category of their view', () => {
    const find = (source: string) => gallery.find((c) => c.items.some((i) => i.source === source))!;
    expect(find('builtin:Theme1/alerts').id).toBe('match');
    expect(find('builtin:Theme6/firstrunnerup').id).toBe('awards');
    expect(find('rb-overall').id).toBe('overall');
    expect(find('builtin:Theme10/matchdata').id).toBe('h2h');
    // No theme slot for the schedule views.
    expect(find('builtin:Theme2/schedule').id).toBe('other');
    expect(all.find((i) => i.source === 'builtin:Theme2/schedule')!.viewKey).toBeNull();
  });

  it('orders the sources: editable first, then themes by number', () => {
    expect(galleryOrigins(gallery)).toEqual([EDITABLE, 'Theme1', 'Theme2', 'Theme6', 'Theme10']);
  });
});
