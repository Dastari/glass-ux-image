import { useEffect, useRef, useState } from 'react';
import { RadioGroup, RadioCard } from 'glass-ux/radio';
import { Skeleton } from 'glass-ux/skeleton';
import { Notice } from 'glass-ux/notice';
import { useMessages } from 'glass-ux/i18n';
import type { PixelBuffer } from '../core/pixels.js';
import type { EffectEntry } from '../filters/effects/catalogue.js';
import { effectsMessages } from '../messages/effects.js';
import { acquireThumbnails, renderThumbnail, thumbnailCutWidth } from './filter-gallery-jobs.js';
/** Thumbnail pixels: a 3:2 tile about 120 CSS pixels wide, sharp at twice the pixel density. */
const THUMB_WIDTH = 240, THUMB_HEIGHT = 160;
/** A host-labelled thumbnail candidate, independent of session or editor state. */
export interface FilterGalleryItem {
    /** Stable candidate id. */
    id: string;
    /** Accessible, visible name supplied by the host. */
    label: string;
    /** Plain built-in filter/warp recipes to preview, in application order. */
    effects: readonly EffectEntry[];
}
/** Controlled/uncontrolled selection over a plain source and filter list. */
export interface FilterGalleryProps {
    /** Candidates; names can come from any host message catalogue. */
    items: readonly FilterGalleryItem[];
    /** Linear premultiplied thumbnail pixels, or an async reader such as session.readPreview. */
    source: PixelBuffer | (() => Promise<PixelBuffer>) | null;
    /** Source pixels per document pixel, when `documentWidth` is not given. Default 1. */
    scale?: number;
    /**
     * The least thumbnail pixels per document pixel that effects render at. A thumbnail shows the
     * whole picture, so a faithful miniature would shrink a 2 px pencil line or a grain to nothing;
     * this keeps each effect's character visible. Default 0.5, about how the picture reads at Fit.
     * Pass 0 for a faithful miniature.
     */
    detailScale?: number;
    /** Original document width, when the async reader chooses its own pyramid level. */
    documentWidth?: number;
    /** Controlled selected candidate. */
    value?: string | null;
    /** Initial selection when uncontrolled. */
    defaultValue?: string | null;
    /** Called when a candidate is chosen. Selection alone never commits an edit. */
    onValueChange?: (id: string) => void;
    /** Accessible gallery name. Defaults to the effects message pack. */
    'aria-label'?: string;
    /** Disable selections while the source loads. */
    disabled?: boolean;
    /** Layout class only. */
    className?: string;
}
/** Worker-rendered thumbnails; the source reader is debounced and cancelled on replacement. */
export function FilterGallery({ items, source, scale = 1, detailScale = 1, documentWidth, value, defaultValue = null, onValueChange, disabled = false, className, 'aria-label': name }: FilterGalleryProps) {
    const messages = useMessages(effectsMessages), [selected, setSelected] = useState(defaultValue), [pictures, setPictures] = useState<Record<string, string>>({}), [failed, setFailed] = useState(false), generation = useRef(0), retainedUrls = useRef<string[]>([]);
    useEffect(() => () => { for (const url of retainedUrls.current) URL.revokeObjectURL(url); }, []);
    useEffect(() => {
        const token = ++generation.current, controller = new AbortController(), release = acquireThumbnails();
        const urls: string[] = [];
        setFailed(false);
        const timer = setTimeout(() => {
            void (async () => {
                if (!source)
                    return;
                const original = typeof source === 'function' ? await source() : source;
                if (controller.signal.aborted)
                    return;
                // The worker resamples; the page only needs the cut's width for the scale.
                const sourceWidth = thumbnailCutWidth(original.width, original.height, THUMB_WIDTH, THUMB_HEIGHT), size = { width: THUMB_WIDTH, height: THUMB_HEIGHT };
                // Thumbnail pixels per document pixel for a faithful miniature, raised to the detail scale.
                const faithful = THUMB_WIDTH / (documentWidth ? sourceWidth * documentWidth / original.width : sourceWidth / scale);
                const effectScale = Math.max(faithful, detailScale);
                const pictures = await Promise.all(items.map(async (item) => {
                    const result = await renderThumbnail(original, item.effects, effectScale, controller.signal, size);
                    if (controller.signal.aborted)
                        return null;
                    const url = URL.createObjectURL(result.blob);
                    urls.push(url);
                    return [item.id, url] as const;
                }));
                if (token === generation.current && !controller.signal.aborted) {
                    for (const url of retainedUrls.current) URL.revokeObjectURL(url);
                    retainedUrls.current = urls;
                    setPictures(Object.fromEntries(pictures.filter((p): p is readonly [
                        string,
                        string
                    ] => p !== null)));
                }
            })().catch(() => { if (!controller.signal.aborted)
                setFailed(true); });
        }, 100);
        return () => { generation.current++; controller.abort(); clearTimeout(timer); release(); if (retainedUrls.current !== urls) for (const url of urls)
            URL.revokeObjectURL(url); };
    }, [source, items, scale, detailScale, documentWidth]);
    return <div className={className}>
 <RadioGroup className="gi-filter-gallery" variant="cards" aria-label={name ?? messages.gallery} disabled={disabled} value={(value === undefined ? selected : value) ?? ''} onValueChange={id => { if (!id) return; if (value === undefined) setSelected(id); onValueChange?.(id); }}>
 {items.map(item => <RadioCard key={item.id} className="gi-filter-choice" value={item.id} onClick={() => { if ((value === undefined ? selected : value) === item.id) onValueChange?.(item.id); }} title={item.label} icon={<span className="gi-filter-thumb">{pictures[item.id] ? <img src={pictures[item.id]} alt="" decoding="async" width={THUMB_WIDTH / 2} height={THUMB_HEIGHT / 2}/> : <Skeleton.Block width="100%" height="100%"/>}</span>}/>)}
 </RadioGroup>
 <div className="gi-feedback" role="status"><Notice role="none" tone="danger" style={{visibility: failed ? undefined : 'hidden'}}>{messages.previewFailed}</Notice></div>
 </div>;
}
