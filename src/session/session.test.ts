import { describe, expect, it, vi } from "vitest";
import { createPixels, IDENTITY_GEOMETRY, pixelSource, type PixelBuffer } from "../core/index.js";
import { adjust, NEUTRAL_ADJUST } from "../filters/adjust.js";
import { sharpen } from "../filters/sharpen.js";
import { CpuBackend, Renderer, composeDocument } from "../render/index.js";
import { createEditorSession, EMPTY_RECIPE, type EditorSessionOptions } from "./index.js";

function gradient(width: number, height: number): PixelBuffer {
  const out = createPixels(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.data.set([x / width, y / height, 0.25, 1], (y * width + x) * 4);
  return out;
}

async function start(options: Partial<EditorSessionOptions> = {}) {
  const session = createEditorSession({ source: pixelSource(gradient(600, 400)), tools: [{ id: "adjust", filters: [adjust, sharpen] }], ...options });
  await vi.waitFor(() => expect(session.state.status).toBe("ready"));
  return session;
}

class Headless extends CpuBackend {
  override get canvas() {
    return { width: 1, height: 1 } as HTMLCanvasElement;
  }
  override resize() {}
  override present() {}
}

const composed = (document: Parameters<typeof composeDocument>[1]) => composeDocument(new Headless(), document);

describe("loading", () => {
  it("reports the picture's size", async () => {
    const session = await start();
    expect(session.state.sourceSize).toEqual({ width: 600, height: 400 });
    expect(session.state.size).toEqual({ width: 600, height: 400 });
  });

  it("continues from a stored recipe", async () => {
    const recipe = { geometry: { ...IDENTITY_GEOMETRY, rotation: 90 as const }, filters: {} };
    const session = await start({ recipe });
    expect(session.state.size).toEqual({ width: 400, height: 600 });
    expect(session.state.dirty).toBe(false);
    expect(session.state.canUndo).toBe(false);
  });

  it("reports a picture that will not open, and does not throw", async () => {
    const onError = vi.fn();
    const session = createEditorSession({ source: new Blob(["not an image"]), onError });
    await vi.waitFor(() => expect(session.state.status).toBe("failed"));
    expect(onError).toHaveBeenCalledOnce();
    expect(session.action("file.save").enabled).toBe(false);
  });
});

describe("history", () => {
  it("records one step per commit, however many previews came first", async () => {
    const session = await start();
    for (const brightness of [5, 10, 15]) session.previewFilter("adjust", { ...NEUTRAL_ADJUST, brightness });
    expect(session.state.canUndo).toBe(false);
    session.commit();
    expect(session.state.canUndo).toBe(true);
    session.undo();
    expect(session.state.recipe).toEqual(EMPTY_RECIPE);
    expect(session.state.canUndo).toBe(false);
    session.redo();
    expect((session.state.recipe.filters.adjust as { brightness: number }).brightness).toBe(15);
  });

  it("records nothing when a commit changes nothing", async () => {
    const session = await start();
    session.commit();
    expect(session.state.canUndo).toBe(false);
    expect(session.state.dirty).toBe(false);
  });

  it("throws away a preview on revert", async () => {
    const session = await start();
    session.previewFilter("adjust", { ...NEUTRAL_ADJUST, contrast: 40 });
    session.revert();
    expect(session.state.draft).toEqual(EMPTY_RECIPE);
  });

  it("drops the redo branch after a new change", async () => {
    const session = await start();
    session.rotate(1);
    session.undo();
    session.flip("x");
    expect(session.state.canRedo).toBe(false);
  });

  it("is dirty after an edit, and clean again if undone", async () => {
    const onDirtyChange = vi.fn();
    const session = await start({ onDirtyChange });
    session.rotate(1);
    expect(session.state.dirty).toBe(true);
    session.undo();
    expect(session.state.dirty).toBe(false);
    expect(onDirtyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("tells the host about each committed change", async () => {
    const onChange = vi.fn();
    const session = await start({ onChange });
    session.flip("y");
    session.undo();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0]![0].geometry.flipY).toBe(true);
  });
});

describe("what reaches the document", () => {
  it("changes size with geometry and keeps the document for filters", async () => {
    const session = await start();
    const first = session.document;
    session.previewFilter("adjust", { ...NEUTRAL_ADJUST, brightness: 20 });
    expect(session.document).toBe(first);
    expect(session.document!.layers[0]!.filters).toHaveLength(1);
    session.rotate(1);
    expect(session.document).not.toBe(first);
    expect(session.state.size).toEqual({ width: 400, height: 600 });
  });

  it("applies filters in the order given, whichever was set first", async () => {
    const session = await start();
    session.previewFilter("sharpen", { amount: 50 });
    session.previewFilter("adjust", { ...NEUTRAL_ADJUST, brightness: 20 });
    expect(session.document!.layers[0]!.filters.map(({ filter }) => filter.id)).toEqual(["adjust", "sharpen"]);
  });

  it("shows the whole picture while cropping and the crop afterwards", async () => {
    const session = await start();
    session.applyCrop({ x: 100, y: 50, width: 300, height: 200 });
    expect(session.document).toMatchObject({ width: 300, height: 200 });
    session.setCropping(true);
    expect(session.document).toMatchObject({ width: 600, height: 400 });
    session.setCropping(false);
    expect(session.document).toMatchObject({ width: 300, height: 200 });
    expect(session.state.size).toEqual({ width: 300, height: 200 });
  });

  it("tells an attached renderer about a new document", async () => {
    const session = await start();
    const renderer = new Renderer({ document: session.document!, backend: new Headless() });
    const setDocument = vi.spyOn(renderer, "setDocument");
    session.attach(renderer);
    session.rotate(1);
    expect(setDocument).toHaveBeenLastCalledWith(session.document);
  });

  it("composes the crop's pixels and nothing else", async () => {
    const session = await start();
    session.applyCrop({ x: 300, y: 100, width: 50, height: 30 });
    const { width, height, bytes } = await composed(session.document!);
    expect([width, height]).toEqual([50, 30]);
    const reference = await composed((await start()).document!);
    const i = (100 * 600 + 300) * 4;
    expect([...bytes.subarray(0, 4)]).toEqual([...reference.bytes.subarray(i, i + 4)]);
  });
});

describe("actions", () => {
  it("runs an action, and does nothing for a disabled or unknown one", async () => {
    const session = await start();
    expect(session.action("edit.undo")).toEqual({ available: true, enabled: false });
    session.run("edit.undo");
    session.run("no.such.action");
    session.run("image.rotateRight");
    expect(session.state.recipe.geometry.rotation).toBe(90);
    expect(session.action("edit.undo").enabled).toBe(true);
  });

  it("lets the host stop an action", async () => {
    const session = await start({ onAction: () => undefined });
    session.run("image.rotateRight");
    expect(session.state.recipe.geometry.rotation).toBe(0);
  });

  it("lets the host wrap an action and change its arguments", async () => {
    const seen: string[] = [];
    const session = await start({
      onAction: ({ id }, next) => {
        seen.push(id);
        return next("crop");
      },
    });
    session.run("tool.select", "adjust");
    expect(seen).toEqual(["tool.select"]);
    expect(session.state.tool).toBe("crop");
  });

  it("lets the host replace, hide and add actions", async () => {
    const run = vi.fn();
    const session = await start({ actions: [{ id: "image.rotateLeft", run }, { id: "image.flipVertical", hidden: true }, { id: "custom.publish", run }] });
    session.run("image.rotateLeft");
    session.run("custom.publish");
    session.run("image.flipVertical");
    expect(run).toHaveBeenCalledTimes(2);
    expect(session.state.recipe).toEqual(EMPTY_RECIPE);
    expect(session.action("image.flipVertical").available).toBe(false);
  });
});

describe("tools", () => {
  it("selects the first tool on open, and tells each tool as it comes and goes", async () => {
    const seen: string[] = [];
    const tool = (id: string) => ({ id, enter: () => seen.push(`enter ${id}`), leave: () => seen.push(`leave ${id}`) });
    const session = await start({ tools: [tool("one"), tool("two")] });
    expect(session.state.tool).toBe("one");
    session.run("tool.select", "two");
    expect(seen).toEqual(["enter one", "leave one", "enter two"]);
  });

  it("lets a tool commit its draft on the way out, and drops anything else", async () => {
    const session = await start({ filters: [adjust], tools: [{ id: "drops" }, { id: "keeps", leave: (s) => s.commit() }] });
    session.previewFilter("adjust", { ...NEUTRAL_ADJUST, brightness: 10 });
    session.run("tool.select", "keeps");
    expect(session.state.recipe.filters.adjust).toBeUndefined();
    session.previewFilter("adjust", { ...NEUTRAL_ADJUST, brightness: 10 });
    session.run("tool.select", "drops");
    expect(session.state.recipe.filters.adjust).toBeDefined();
  });
});

describe("saving", () => {
  it("offers no save without a handler", async () => {
    const session = await start();
    expect(session.action("file.save").enabled).toBe(false);
  });

  it("hands the host a result and marks the session clean", async () => {
    const onSave = vi.fn();
    const session = await start({ onSave });
    session.rotate(1);
    await session.run("file.save");
    expect(onSave).toHaveBeenCalledOnce();
    const [result, context] = onSave.mock.calls[0]!;
    expect([result.width, result.height]).toEqual([400, 600]);
    expect(context.signal).toBeInstanceOf(AbortSignal);
    expect(session.state.save).toBe("saved");
    expect(session.state.dirty).toBe(false);
  });

  it("stops saying saved once there is a new edit", async () => {
    const session = await start({ onSave: () => {} });
    await session.run("file.save");
    expect(session.state.save).toBe("saved");
    session.rotate(1);
    expect(session.state.save).toBe("idle");
    expect(session.action("file.save").enabled).toBe(true);
  });

  it("clears a failure once there is a new edit", async () => {
    const session = await start({ onSave: () => Promise.reject(new Error("No")) });
    await session.run("file.save");
    expect(session.state.save).toBe("failed");
    session.flip("x");
    expect(session.state.save).toBe("idle");
    expect(session.state.saveError).toBeUndefined();
  });

  it("stays dirty and keeps the error when saving fails", async () => {
    const onError = vi.fn();
    const failure = new Error("Upload refused");
    const session = await start({ onSave: () => Promise.reject(failure), onError });
    session.rotate(1);
    await session.run("file.save");
    expect(session.state.save).toBe("failed");
    expect(session.state.saveError).toBe(failure);
    expect(session.state.dirty).toBe(true);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("aborts through the signal and is not a failure", async () => {
    const session = await start({
      onSave: (_result, { signal }) => new Promise((_done, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
    });
    session.rotate(1);
    const saving = session.run("file.save");
    expect(session.state.save).toBe("saving");
    expect(session.action("file.save").enabled).toBe(false);
    session.cancelSave();
    await saving;
    expect(session.state.save).toBe("idle");
    expect(session.state.dirty).toBe(true);
  });

  it("passes progress through", async () => {
    const seen: Array<number | null> = [];
    const session = await start({ onSave: (_r, { setProgress }) => setProgress(0.5) });
    session.subscribe(() => seen.push(session.state.saveProgress));
    await session.run("file.save");
    expect(seen).toContain(0.5);
  });

  it("calls the host on cancel", async () => {
    const onCancel = vi.fn();
    const session = await start({ onCancel });
    session.run("file.cancel");
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
