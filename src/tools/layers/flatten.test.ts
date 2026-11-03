import { describe, expect, it, vi } from "vitest";
import { pixelSource, createPixels } from "../../core/index.js";
import { createEditorSession, EMPTY_RECIPE } from "../../session/index.js";

async function start(onAction?: Parameters<typeof createEditorSession>[0]["onAction"]) {
  const source = pixelSource(createPixels(600, 400));
  const session = createEditorSession({ source, onAction });
  await vi.waitFor(() => expect(session.state.status).toBe("ready"));
  return { session, source };
}

describe("undoable base replacement used by flatten", () => {
  it("records a different base even when both recipes are clean, and restores it on undo/redo", async () => {
    const { session, source } = await start();
    const flattened = pixelSource(createPixels(300, 200));
    session.commit(EMPTY_RECIPE, { source: flattened, label: "Flatten" });
    expect(session.state.recipe).toEqual(EMPTY_RECIPE);
    expect(session.history.current.label).toBe("Flatten");
    expect(session.state.dirty).toBe(true);
    expect(session.original).toBe(flattened);
    expect(session.state.sourceSize).toEqual({ width: 300, height: 200 });
    expect(session.document!.layers).toHaveLength(1);
    session.undo();
    expect(session.original).toBe(source);
    expect(session.state.size).toEqual({ width: 600, height: 400 });
    expect(session.state.dirty).toBe(false);
    session.redo();
    expect(session.original).toBe(flattened);
    expect(session.result()).toMatchObject({ width: 300, height: 200 });
    session.dispose();
  });

  it("retains source checkpoints across later edits and history branches", async () => {
    const { session, source } = await start();
    const flattened = pixelSource(createPixels(100, 80));
    session.commit(EMPTY_RECIPE, { source: flattened, label: "Flatten" });
    const flattenId = session.history.current.id;
    session.commit({ geometry: { ...EMPTY_RECIPE.geometry, crop: { x: 0, y: 0, width: 30, height: 20 } } });
    const cropId = session.history.current.id;
    session.undo(); session.undo();
    session.commit({ geometry: { ...EMPTY_RECIPE.geometry, rotation: 90 } });
    expect(session.original).toBe(source);
    expect(session.state.size).toEqual({ width: 400, height: 600 });
    session.goTo(cropId);
    expect(session.original).toBe(flattened);
    expect(session.state.size).toEqual({ width: 30, height: 20 });
    session.goTo(flattenId);
    expect(session.state.size).toEqual({ width: 100, height: 80 });
    session.dispose();
  });

  it("renders historical recipe previews against their original source after flatten", async () => {
    const { session } = await start();
    const originalRecipe = session.state.recipe;
    session.commit(EMPTY_RECIPE, { source: pixelSource(createPixels(30, 20)), label: "Flatten" });
    const before = await session.readPreview(600, { recipe: originalRecipe });
    const after = await session.readPreview(600);
    expect([before.width, before.height]).toEqual([600, 400]);
    expect([after.width, after.height]).toEqual([30, 20]);
    session.dispose();
  });

  it("allows the host to refuse replacement without changing base, history or recipe", async () => {
    const onAction = vi.fn((action, next) => action.id === "edit.commit" ? undefined : next());
    const { session, source } = await start(onAction);
    session.commit(EMPTY_RECIPE, { source: pixelSource(createPixels(1, 1)), label: "Flatten" });
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: "edit.commit" }), expect.any(Function));
    expect(session.original).toBe(source);
    expect(session.history.nodes).toHaveLength(1);
    expect(session.state.dirty).toBe(false);
    session.dispose();
  });

  it("allows the host to refuse flatten before any export work", async () => {
    const { session, source } = await start((action, next) => action.id === "layers.flatten" ? undefined : next());
    const result = vi.spyOn(session, "result");
    await session.flatten({ label: "Flatten" });
    expect(result).not.toHaveBeenCalled();
    expect(session.original).toBe(source);
    expect(session.history.nodes).toHaveLength(1);
    session.dispose();
  });
});
