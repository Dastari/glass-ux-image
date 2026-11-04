import type { ImageTool } from "glass-ux-image/react";
import { layers } from "glass-ux-image/tools/layers";
import { text } from "glass-ux-image/tools/text";
/** Tools supplied independently by the layers domain. */
export const layersTools: readonly ImageTool[] = [layers, text];

// An opt-in public-API exercise for browser conformance, absent from ordinary demo interaction.
if (new URLSearchParams(location.search).has("layers-test")) {
  Object.assign(window, {
    layersRasterCheck: async () => {
      const { createTextSource, createTextCanvas } = await import("glass-ux-image/layers-text");
      const { pixelsFromRgba8, tileRect } = await import("glass-ux-image/core");
      const spec = { content: "Italic glyphs ffi é ".repeat(8) + "\nمرحبا بالعالم", fontFamily: "serif", fontWeight: 700,
        fontStyle: "italic" as const, fontSize: 60, colour: [1, 0.4, 0.2, 0.8] as const,
        alignment: "start" as const, direction: "rtl" as const, lineHeight: 76, letterSpacing: 1.5, boxWidth: 1000,
        outline: { width: 3, colour: [0.2, 0.8, 1, 1] as const },
        shadow: { blur: 8, offsetX: -13, offsetY: 9, colour: [0, 0, 0, 0.7] as const } };
      await document.fonts.ready;
      const source = createTextSource(spec);
      const differences: number[] = [];
      let alpha = 0, outside = 0;
      for (const level of [0, 1, 2]) {
        const scale = 2 ** -level, width = Math.ceil(source.width * scale), height = Math.ceil(source.height * scale);
        const canvas = createTextCanvas();
        canvas.begin(width, height, scale, source.bounds.x, source.bounds.y);
        for (const line of source.layout.lines) canvas.draw(line.text, line.x, line.baseline, spec, scale);
        const reference = pixelsFromRgba8(canvas.read(width, height), width, height);
        let worst = 0;
        for (let y = 0; y < Math.ceil(height / 256); y++) for (let x = 0; x < Math.ceil(width / 256); x++) {
          const address = { level, x, y }, rect = tileRect(source, address), tile = source.readTile(address);
          for (let row = 0; row < tile.height; row++) for (let col = 0; col < tile.width; col++) for (let c = 0; c < 4; c++) {
            const a = tile.data[(row * tile.width + col) * 4 + c]!, b = reference.data[((rect.y + row) * width + rect.x + col) * 4 + c]!;
            worst = Math.max(worst, Math.abs(a - b));
            if (c === 3) alpha += a;
          }
        }
        differences.push(worst);
      }
      // Render past the advertised bounds to detect clipped outline/shadow support.
      const margin = 100, canvas = createTextCanvas(), width = source.width + margin * 2, height = source.height + margin * 2;
      canvas.begin(width, height, 1, source.bounds.x - margin, source.bounds.y - margin);
      for (const line of source.layout.lines) canvas.draw(line.text, line.x, line.baseline, spec, 1);
      const bytes = canvas.read(width, height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (x < margin || x >= width - margin || y < margin || y >= height - margin) outside = Math.max(outside, bytes[(y * width + x) * 4 + 3]!);
      }
      return { differences, alpha, outside, bounds: source.bounds };
    },
  });
}

if (new URLSearchParams(location.search).has("layers-test")) {
  Object.assign(window, {
    layersFlattenCheck: async (prefer: "cpu" | "webgl2") => {
      const { createEditorSession, EMPTY_RECIPE } = await import("glass-ux-image/session");
      const { createPixels, tileRect, solidSource, normaliseGeometry, pixelsToRgba8 } = await import("glass-ux-image/core");
      const { CpuBackend, WebGL2Backend, Renderer } = await import("glass-ux-image/render");
      const { adjust, NEUTRAL_ADJUST } = await import("glass-ux-image/filters/adjust");
      const { defaultTextSpec, textLayerKind, addTextLayer } = await import("glass-ux-image/tools/text");
      const { flattenImage } = await import("glass-ux-image/tools/layers");
      const reads: number[] = [], actions: string[] = [];
      let rejectFlatten = false, rejectCommit = false, stageCalls = 0;
      const source = { width: 900, height: 650, readTile(tile: { level: number; x: number; y: number }) {
        reads.push(tile.level);
        const rect = tileRect(source, tile), pixels = createPixels(rect.width, rect.height), scale = 2 ** tile.level;
        for (let y = 0; y < pixels.height; y++) for (let x = 0; x < pixels.width; x++) {
          const px = (rect.x + x) * scale, py = (rect.y + y) * scale;
          const alpha = ((px + py) % 17 + 1) / 18;
          pixels.data.set([((px % 97) / 97) * alpha, ((py % 89) / 89) * alpha, 0.3 * alpha, alpha], (y * pixels.width + x) * 4);
        }
        return pixels;
      } };
      const session = createEditorSession({ source, filters: [adjust], layerKinds: [textLayerKind],
        stages: [{ id: "flatten-proof", apply(base, recipe) {
          if (!recipe.strokes?.length) return base;
          stageCalls++;
          return { ...base, async readTile(tile) {
            const pixels = await base.readTile(tile), data = pixels.data.slice();
            for (let i = 0; i < data.length; i += 4) data[i] = data[i]! * 0.75;
            return { ...pixels, data };
          } };
        } }],
        onAction(action, next) {
          actions.push(action.id);
          if ((rejectFlatten && action.id === "layers.flatten") || (rejectCommit && action.id === "edit.commit")) return;
          return next();
        },
      });
      while (session.state.status === "loading") await new Promise(resolve => setTimeout(resolve));
      session.assets.set({ id: "overlay", source: solidSource({ width: 80, height: 60 }, [0.2, 0.1, 0.3, 0.5]) });
      session.commit({
        geometry: { ...normaliseGeometry(), crop: { x: 70, y: 35, width: 710, height: 510 }, resize: { width: 550, height: 390, dpi: 144 } },
        filters: { adjust: { ...NEUTRAL_ADJUST, brightness: 13, contrast: 11 } },
        strokes: [{ id: "proof", tool: "flatten-proof", params: {}, points: [{ x: 10, y: 10 }] }],
        layers: [
          { id: "overlay", name: "Overlay", kind: "image", asset: "overlay", visible: true, opacity: 0.7, blend: "multiply", quad: [[80, 60], [500, 70], [490, 400], [90, 410]] },
          { id: "hidden", name: "Hidden", kind: "image", asset: "overlay", visible: false, opacity: 1, blend: "normal", quad: [[0, 0], [900, 0], [900, 650], [0, 650]] },
        ],
      });
      await addTextLayer(session, { ...defaultTextSpec, content: "Full resolution مرحبا", fontSize: 38, lineHeight: 48 }, [100, 160], "Text", "Text");
      const recipe = session.state.recipe, original = session.original;
      const backend = prefer === "cpu" ? new CpuBackend() : new WebGL2Backend();
      const renderer = new Renderer({ document: session.document!, backend }); session.attach(renderer);
      try {
        // A deliberately tiny displayed preview must never become flatten's input.
        const preview = await session.readPreview(50);
        reads.length = 0;
        const before = await session.result().toBlob({ type: "image/png" });
        const exportSettings = [
          { type: "image/jpeg", quality: 0.83 }, { type: "image/webp", quality: 0.81 },
          { type: "image/png", width: 275, height: 195 }, { type: "image/png", alpha: false },
        ];
        const beforeFiles: Blob[] = [];
        for (const settings of exportSettings) beforeFiles.push(await session.result().toBlob(settings));
        rejectFlatten = true; await flattenImage(session, "Flatten layers"); rejectFlatten = false;
        const refusedStart = session.state.recipe === recipe && session.original === original;
        rejectCommit = true; await flattenImage(session, "Flatten layers"); rejectCommit = false;
        const refusedCommit = session.state.recipe === recipe && session.original === original;
        const count = session.history.nodes.length;
        await flattenImage(session, "Flatten layers");
        const flattened = session.state.recipe, label = session.history.current.label;
        const oneStep = session.history.nodes.length === count + 1;
        const after = await session.result().toBlob({ type: "image/png" });
        const size = session.state.sourceSize, singleBase = session.document!.layers.length === 1;
        const raster = pixelsToRgba8(await session.readPreview(550));
        const bitmap = await createImageBitmap(before), canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d", { willReadFrequently: true })!; context.drawImage(bitmap, 0, 0); bitmap.close();
        const expected = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const basePixelsEqual = raster.length === expected.length && raster.every((value, i) => value === expected[i]);
        // A save writes the actual resulting Blob, and compares its complete encoded file bytes.
        const file = new File([after], "flattened.png", { type: "image/png" });
        const savedEqual = async (a: Blob, b: Blob) => {
          const aa = new Uint8Array(await a.arrayBuffer()), bb = new Uint8Array(await b.arrayBuffer());
          return aa.length === bb.length && aa.every((value, i) => value === bb[i]);
        };
        let otherFormatsEqual = true;
        for (let i = 0; i < exportSettings.length; i++) {
          if (!await savedEqual(beforeFiles[i]!, await session.result().toBlob(exportSettings[i]!))) otherFormatsEqual = false;
        }
        session.undo();
        const undoRecipe = session.state.recipe === recipe, undoSource = session.original === original;
        const undoEqual = await savedEqual(before, await session.result().toBlob({ type: "image/png" }));
        session.redo();
        const redoEqual = await savedEqual(before, await session.result().toBlob({ type: "image/png" }));
        // Trigger the ordinary composition path again after undoing a new edit of the flattened base.
        session.commit({ filters: { adjust: { ...NEUTRAL_ADJUST, brightness: 1 } } }, { label: "Edit flattened base" });
        const subsequentSize = session.state.size;
        session.undo();
        const cleanAfterUndo = session.state.recipe === flattened;
        return { backend: backend.info.kind, preview: [preview.width, preview.height], size, singleBase,
          otherFormatsEqual, basePixelsEqual, clean: JSON.stringify(flattened) === JSON.stringify(EMPTY_RECIPE), layerCount: flattened.layers!.length,
          byteEqual: await savedEqual(before, file), undoEqual, redoEqual, undoRecipe, undoSource, oneStep,
          refusedStart, refusedCommit, label, actions, stageCalls, fullResolutionRead: reads.includes(0), subsequentSize, cleanAfterUndo };
      } finally { session.attach(undefined); renderer.dispose(); session.dispose(); }
    },
  });
}

// Layer strokes and masks through a project file, for e2e/layer-strokes.spec.ts: public entries only.
if (new URLSearchParams(location.search).has("layers-test")) {
  Object.assign(window, {
    layerProjectRoundTrip: async (session: import("glass-ux-image/session").EditorSession) => {
      const { snapshotSession, encodeProject, attachSessionFiles } = await import("glass-ux-image/io");
      const blob = await encodeProject(await snapshotSession(session));
      const detach = attachSessionFiles(session);
      try { await session.run("file.project.open", blob); } finally { detach(); }
      return blob.size;
    },
  });
}
