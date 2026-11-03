import { effects } from 'glass-ux-image/tools/effects';
import type { ImageTool } from 'glass-ux-image/react';
/** Effect tool sections, consumed exactly as a host imports them. */
export const effectsTools: readonly ImageTool[] = [effects];
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppearanceProvider } from 'glass-ux/appearance';
import { TooltipProvider } from 'glass-ux/tooltip';
import { useMessages } from 'glass-ux/i18n';
import { effectsMessages } from 'glass-ux-image/messages/effects';
import { FilterGallery } from 'glass-ux-image/panels/filter-gallery';
import { createPixels } from 'glass-ux-image/core';
const gallerySource = createPixels(32, 24);
for (let i = 0; i < gallerySource.data.length; i += 4)
    gallerySource.data.set([.2, .1, .05, 1], i);
function StandaloneGalleryExample() {
    const m = useMessages(effectsMessages), [value, setValue] = useState<string | null>(null);
    const items = [{ id: 'sepia', label: m.sepia, effects: [{ id: 's', filter: 'sepia', params: { amount: 1 }, strength: 1 }] }];
    return createElement(FilterGallery, { source: gallerySource, items, value, onValueChange: setValue, 'aria-label': m.gallery });
}
let unmount: (() => void) | undefined;
/** A host's standalone example: plain data and a source, with no editor provider or session. */
window.effectsDemo = { mountGallery() { unmount?.(); const element = document.createElement('div'); document.body.append(element); const root = createRoot(element); root.render(createElement(AppearanceProvider, null, createElement(TooltipProvider, null, createElement(StandaloneGalleryExample)))); unmount = () => { root.unmount(); element.remove(); }; }, unmountGallery() { unmount?.(); unmount = undefined; } };
declare global {
    interface Window {
        effectsDemo: {
            mountGallery: () => void;
            unmountGallery: () => void;
        };
    }
}
