import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'glass-ux/button';
import { Surface } from 'glass-ux/surface';
import { IconArrowDown, IconArrowUp, IconFilter, IconTrash } from 'glass-ux/icons';
import { EmptyState } from 'glass-ux/empty-state';
import { SliderField } from 'glass-ux/slider';
import { FileDrop } from 'glass-ux/file-drop';
import { useMessages } from 'glass-ux/i18n';
import { Notice } from 'glass-ux/notice';
import { ColorPicker } from 'glass-ux/color-picker';
import { linearToSrgb, srgbToLinear } from '../../core/pixels.js';
import { effectsMessages, type EffectsMessages } from '../../messages/effects.js';
import { useEditor, useSessionState } from '../../react/session-context.js';
import type { EditorSession } from '../../session/index.js';
import { FilterGallery, type FilterGalleryItem } from '../../panels/filter-gallery.js';
import { effectDefinitions, effectParams, REFERENCE_EDGE, type EffectCategory, type EffectEntry, type EffectPictureSize } from '../../filters/effects/catalogue.js';
import { cinematicLooks, effectPresets, fitPreset, type EffectPreset } from '../../filters/effects/presets.js';
import type { Lut3D } from '../../filters/effects/grading.js';
import { readEffects, effectRecipeFilters, type EffectActionArgs } from './actions.js';
import { createId } from '../../core/id.js';
/** Effects with neutral defaults, offered through looks and imports rather than as gallery candidates. */
const hidden = new Set(['lut-grading', 'colour-grade']);
const labels: Record<string, keyof EffectsMessages> = { 'warm-film': 'warmFilm', 'silver-screen': 'silverScreen', 'soft-cinema': 'softCinema', pencil: 'pencil', 'ink-print': 'inkPrint', miniature: 'miniature' };
const nameOf = (m: EffectsMessages, id: string) => { const definition = effectDefinitions.find(d => d.id === id); return m[(definition?.label ?? id) as keyof EffectsMessages] ?? id; };
function freshId() { return createId(); }
function entry(filter: string, params: Record<string, unknown>): EffectEntry { return { id: freshId(), filter, params, strength: 1 }; }
function presetEntries(preset: EffectPreset) { return Object.entries(preset.filters).map(([id, params]) => entry(id, params)); }
const previews = new WeakMap<EditorSession, {
    recipe: unknown;
    promise: ReturnType<EditorSession['readPreview']>;
}>();
function preview(session: EditorSession) { const existing = previews.get(session); if (existing?.recipe === session.state.draft)
    return existing.promise; const promise = session.readPreview(360); previews.set(session, { recipe: session.state.draft, promise }); return promise; }
/** A session-bound gallery category or full gallery, usable inside any editor provider or with a session. */
export interface FilterGalleryPanelProps {
    /** Session to edit; defaults to the nearest ImageEditorProvider. */
    session?: EditorSession;
    /** Category to browse; omitted shows every filter. */
    category?: EffectCategory;
    /** Show look/preset recipes instead of individual filters. */
    presets?: boolean;
}
/** Session-bound effect candidates with worker-rendered thumbnails; selection commits an intercepted action. */
export function FilterGalleryPanel({ session: provided, category, presets = false }: FilterGalleryPanelProps) {
    const session = useEditor(provided), { draft, size, status } = useSessionState(session), m = useMessages(effectsMessages), [error, setError] = useState(false);
    const importer = useRef<Worker | undefined>(undefined), importGeneration = useRef(0);
    useEffect(() => () => { importGeneration.current++; importer.current?.terminate(); }, [session]);
    const importCube = async (file: File) => { const token = ++importGeneration.current; importer.current?.terminate(); try {
        const text = await file.text();
        if (token !== importGeneration.current)
            return;
        const worker = new Worker(new URL('./cube-worker.js', import.meta.url), { type: 'module' });
        importer.current = worker;
        worker.onmessage = (event: MessageEvent<{
            lut?: Lut3D;
            error?: boolean;
        }>) => { if (token !== importGeneration.current)
            return; if (event.data.lut) {
            session.run('effects.import', { entries: [entry('lut-grading', { amount: 1, lut: event.data.lut })], label: m.importLut });
            setError(false);
        }
        else
            setError(true); worker.terminate(); };
        worker.onerror = () => { if (token === importGeneration.current)
            setError(true); worker.terminate(); };
        worker.postMessage(text);
    }
    catch {
        if (token === importGeneration.current)
            setError(true);
    } };
    const source = useCallback(() => preview(session), [session, draft]);
    // Defaults and looks are fitted to the picture, so each thumbnail is a faithful miniature of the result.
    const width = size?.width, height = size?.height, fitted = useMemo(() => width && height ? { width, height } : null, [width, height]);
    const items = useMemo<FilterGalleryItem[]>(() => presets ? [...cinematicLooks, ...effectPresets].map(p => ({ id: p.id, label: m[labels[p.id]!] ?? p.id, effects: presetEntries(fitPreset(p, fitted)) })) : effectDefinitions.filter(d => (!category || d.category === category) && !hidden.has(d.id)).map(d => ({ id: d.id, label: nameOf(m, d.id), effects: [entry(d.id, effectParams(d.id, fitted))] })), [presets, category, m, fitted]);
    const choose = (id: string) => { const item = items.find(i => i.id === id)!; session.run(presets ? 'effects.preset' : 'effects.add', presets ? { entries: item.effects.map(e => ({ ...e, id: freshId() })), label: m.presetHistory } : { entry: { ...item.effects[0]!, id: freshId() }, label: m.addHistory }); };
    return <div className="gi-effects-category">
 <FilterGallery items={items} source={status === 'ready' ? source : null} documentWidth={size?.width} detailScale={0} onValueChange={choose} disabled={status !== 'ready'} aria-label={presets ? m.looks : category ? m[category] : m.gallery}/>
 {(category === 'grading' || !category) && !presets && <><FileDrop variant="compact" aria-label={m.importLut} accept=".cube" maxSize={16 * 1024 * 1024} maxFiles={1} onFiles={(files, rejected) => { if (rejected.length) {
            setError(true);
            return;
        } const file = files[0]; if (file) {
            void importCube(file);
        } }}/>
 <div className="gi-effects-error" role="status">{error && <Notice role="none" tone="danger">{m.importFailed}</Notice>}</div></>}
 </div>;
}
/** Props for the session-bound editable effect stack. */
export interface EffectsStackPanelProps {
    /** Session to edit; defaults to the nearest provider. */
    session?: EditorSession;
}
/** Duplicate effects can be reordered, blended, edited and removed with intercepted labelled actions. */
export function EffectsStackPanel({ session: provided }: EffectsStackPanelProps) {
    const session = useEditor(provided), { size } = useSessionState(session);
    const m = useMessages(effectsMessages), entries = readEffects(session);
    const update = (id: string, patch: EffectActionArgs['patch'], commit: boolean) => { if (commit) {
        session.run('effects.update', { id, patch, label: m.updateHistory });
        return;
    } const next = readEffects(session).map(e => e.id === id ? { ...e, ...patch } : e); session.preview({ filters: effectRecipeFilters(session, next) }); };
    const reorder = (at: number, delta: number) => { const ids = entries.map(e => e.id), other = at + delta; [ids[at], ids[other]] = [ids[other]!, ids[at]!]; session.run('effects.reorder', { order: ids, label: m.orderHistory }); };
    return <div className="gi-effects-stack" role="group" aria-label={m.stack}>{entries.length === 0 && <EmptyState className="gi-effects-empty" icon={<IconFilter />}>{m.noEffects}</EmptyState>}{entries.map((e, index) => <Surface material="inset" radius="tile" className="gi-effects-entry" key={e.id} role="group" aria-label={nameOf(m, e.filter)}>
 <div className="gi-effects-head"><span className="gi-effects-name">{nameOf(m, e.filter)}</span><div className="gi-effects-row"><Button size="xs" variant="ghost" icon={<IconArrowUp />} aria-label={m.earlier} disabled={index === 0} onClick={() => reorder(index, -1)}/><Button size="xs" variant="ghost" icon={<IconArrowDown />} aria-label={m.later} disabled={index === entries.length - 1} onClick={() => reorder(index, 1)}/><Button size="xs" variant="ghost" icon={<IconTrash />} aria-label={m.remove} onClick={() => session.run('effects.remove', { id: e.id, label: m.remove })}/></div></div>
 <SliderField label={m.strength} min={0} max={100} step={1} size="sm" value={Math.round(e.strength * 100)} onValueChange={v => update(e.id, { strength: v / 100 }, false)} onValueCommitted={v => update(e.id, { strength: v / 100 }, true)}/>
 <ParameterControls effect={e} messages={m} size={size} onChange={(params, commit) => update(e.id, { params }, commit)}/>
 </Surface>)}</div>;
}
interface Control {
    key: string;
    label: keyof EffectsMessages;
    min: number;
    max: number;
    step: number;
    fallback: number;
}
function ParameterControls({ effect: e, messages: m, size, onChange }: {
    effect: EffectEntry;
    messages: EffectsMessages;
    size?: EffectPictureSize | null;
    onChange: (params: Record<string, unknown>, commit: boolean) => void;
}) {
    const d = effectDefinitions.find(d => d.id === e.filter);
    if (!d)
        return null;
    const controls: Control[] = [];
    // Length ranges grow with the picture, as its fitted defaults do.
    const k = size ? Math.max(1, Math.max(size.width, size.height) / REFERENCE_EDGE) : 1, long = (n: number) => Math.round(n * k);
    const add = (key: string, label: keyof EffectsMessages, min: number, max: number, step: number, fallback: number) => controls.push({ key, label, min, max, step, fallback });
    if (e.filter === 'gaussian-blur')
        add('sigma', 'radius', 0, long(30), .25, 3);
    else if (['blur', 'sharpness', 'artistic'].includes(d.category) || ['bloom', 'glow', 'lens-flare', 'reduce-noise', 'remove-grain', 'emboss'].includes(e.filter))
        add('radius', 'radius', 0, d.lengths.includes('radius') ? long(e.filter === 'lens-flare' ? 300 : 40) : 30, .25, 2);
    if (e.filter === 'motion-blur')
        add('angle', 'angle', -180, 180, 1, 0);
    if (e.filter === 'tilt-shift') {
        add('focus', 'focus', 0, 1, .01, .5);
        add('band', 'band', .01, 1, .01, .2);
    }
    if (d.category === 'pixel' || ['film-grain', 'add-noise'].includes(e.filter))
        add('size', 'size', 1, d.lengths.includes('size') ? long(64) : 64, d.lengths.includes('size') ? .5 : 1, d.category === 'pixel' ? 12 : 1);
    if (['film-grain', 'add-noise'].includes(e.filter))
        add('seed', 'seed', 0, 65535, 1, 7);
    if (e.filter === 'posterise')
        add('levels', 'levels', 2, 32, 1, 6);
    if (['threshold', 'solarise'].includes(e.filter))
        add('pivot', 'pivot', 0, 1, .01, .5);
    if (e.filter === 'bloom')
        add('threshold', 'pivot', 0, 1, .01, .7);
    if (d.category === 'distortion') {
        if (d.lengths.includes('amount'))
            add('amount', 'displacement', -long(40), long(40), .1, 6);
        else
            add('amount', 'displacement', -10, 10, .1, .7);
        if (e.filter !== 'wave')
            add('radius', 'radius', 1, long(1000), 1, 400);
        if (['wave', 'ripple'].includes(e.filter))
            add('wavelength', 'wavelength', 1, long(300), 1, 40);
    }
    if (['reduce-noise', 'remove-grain'].includes(e.filter))
        add('tolerance', 'tolerance', .01, 1, .01, .15);
    if (['wave', 'ripple'].includes(e.filter))
        add('phase', 'phase', -Math.PI, Math.PI, .01, 0);
    if (d.category === 'distortion' || ['lens-flare', 'radial-blur'].includes(e.filter)) {
        add('centreX', 'centreX', 0, 1, .01, e.filter === 'lens-flare' ? .25 : .5);
        add('centreY', 'centreY', 0, 1, .01, e.filter === 'lens-flare' ? .25 : .5);
    }
    const parameter = (key: string, value: number) => key === 'centreX' || key === 'centreY' ? { ...e.params, centre: [key === 'centreX' ? value : ((e.params.centre as number[] | undefined)?.[0] ?? (e.filter === 'lens-flare' ? .25 : .5)), key === 'centreY' ? value : ((e.params.centre as number[] | undefined)?.[1] ?? (e.filter === 'lens-flare' ? .25 : .5))] } : { ...e.params, [key]: value };
    const tint = (e.params.colour as number[] | undefined) ?? [1, .8, .5];
    const hex = '#' + tint.map(v => Math.round(linearToSrgb(v) * 255).toString(16).padStart(2, '0')).join('');
    const tintChange = (hex: string, commit: boolean) => onChange({ ...e.params, colour: [1, 3, 5].map(i => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) }, commit);
    return <>{controls.map(c => <SliderField key={c.key} label={m[c.label]} {...(c.min < 0 && c.max > 0 ? { origin: 0 } : {})} min={c.min} max={c.max} step={c.step} size="sm" value={Number(c.key === 'centreX' || c.key === 'centreY' ? (e.params.centre as number[] | undefined)?.[c.key === 'centreX' ? 0 : 1] ?? c.fallback : e.params[c.key] ?? c.fallback)} onValueChange={v => onChange(parameter(c.key, v), false)} onValueCommitted={v => onChange(parameter(c.key, v), true)}/>)}{e.filter === 'lens-flare' && <ColorPicker size="sm" aria-label={m.colour} value={hex} onValueChange={v => tintChange(v, false)} onValueCommit={v => tintChange(v, true)}/>}</>;
}
