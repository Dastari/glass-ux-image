import { IconLayers } from "glass-ux/icons";
import { layersMessages } from "../../messages/layers.js";
import { SessionLayersPanel } from "../../panels/layers.js";
import { defineTool } from "../../react/tool.js";
import { layerActions } from "../select-actions.js";
export { addImageLayer, duplicateLayer, removeLayer, mergeLayerRange, flattenImage } from "./operations.js";
export { LayersPanel, SessionLayersPanel, type LayersPanelProps, type SessionLayersPanelProps } from "../../panels/layers.js";
/** Image layers and layer stack management, with Photoshop's layer commands; imports no text rasteriser or text editor. */
export const layers = defineTool({ id: "layers", group: "layers", messages: layersMessages,
  label: m => m.layers, icon: <IconLayers />, Panel: SessionLayersPanel, actions: layerActions,
  reset: () => ({ layers: [] }) });
