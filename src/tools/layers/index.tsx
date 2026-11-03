import { IconLayers } from "glass-ux/icons";
import { layersMessages } from "../../messages/layers.js";
import { SessionLayersPanel } from "../../panels/layers.js";
import { defineTool } from "../../react/tool.js";
export { addImageLayer, mergeLayerRange, flattenImage } from "./operations.js";
export { LayersPanel, SessionLayersPanel, type LayersPanelProps, type SessionLayersPanelProps } from "../../panels/layers.js";
/** Image layers and layer stack management; imports no text rasteriser or text editor. */
export const layers = defineTool({ id: "layers", group: "layers", messages: layersMessages,
  label: m => m.layers, icon: <IconLayers />, Panel: SessionLayersPanel,
  reset: () => ({ layers: [] }) });
