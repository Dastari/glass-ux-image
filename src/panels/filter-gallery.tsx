import { useEffect, useRef, useState } from 'react';
import { RadioGroup, RadioCard } from 'glass-ux/radio';
import { Skeleton } from 'glass-ux/skeleton';
import { Notice } from 'glass-ux/notice';
import { useMessages } from 'glass-ux/i18n';
import type { PixelBuffer } from '../core/pixels.js';
import type { EffectEntry } from '../filters/effects/catalogue.js';
import { effectsMessages } from '../messages/effects.js';
import { acquireThumbnails, renderThumbnail } from './filter-gallery-jobs.js';
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
    /** Thumbnail pixels per document pixel. Default 1. */
    scale?: number;
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
export function FilterGallery({ items, source, scale = 1, documentWidth, value, defaultValue = null, onValueChange, disabled = false, className, 'aria-label': name }: FilterGalleryProps) {
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
                const ratio = Math.min(1, 48 / Math.max(original.width, original.height)), width = Math.max(1, Math.round(original.width * ratio)), height = Math.max(1, Math.round(original.height * ratio));
                const pixels: PixelBuffer = { width, height, data: new Float32Array(width * height * 4) };
                for (let y = 0; y < height; y++)
                    for (let x = 0; x < width; x++) {
                        const i = (Math.min(original.height - 1, Math.floor((y + .5) / ratio)) * original.width + Math.min(original.width - 1, Math.floor((x + .5) / ratio))) * 4;
                        pixels.data.set(original.data.subarray(i, i + 4), (y * width + x) * 4);
                    }
                const pictures = await Promise.all(items.map(async (item) => {
                    const result = await renderThumbnail(pixels, item.effects, documentWidth ? width / documentWidth : scale * ratio, controller.signal);
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
    }, [source, items, scale, documentWidth]);
    return <div className={className}>
 <RadioGroup className="gi-filter-gallery" variant="cards" aria-label={name ?? messages.gallery} disabled={disabled} value={(value === undefined ? selected : value) ?? ''} onValueChange={id => { if (!id) return; if (value === undefined) setSelected(id); onValueChange?.(id); }}>
 {items.map(item => <RadioCard key={item.id} className="gi-filter-choice" value={item.id} onClick={() => { if ((value === undefined ? selected : value) === item.id) onValueChange?.(item.id); }} title={item.label} icon={<span className="gi-filter-thumb">{pictures[item.id] ? <img src={pictures[item.id]} alt="" width={48} height={32}/> : <Skeleton.Block width="100%" height="100%"/>}</span>}/>)}
 </RadioGroup>
 <div className="gi-feedback" role="status"><Notice role="none" tone="danger" style={{visibility: failed ? undefined : 'hidden'}}>{messages.previewFailed}</Notice></div>
 </div>;
}
