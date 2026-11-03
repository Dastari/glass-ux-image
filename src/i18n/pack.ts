import type { ImageLocale } from "../messages/types.js";
import { geometryTranslations } from "./domains/geometry.js";
import { developTranslations } from "./domains/develop.js";
import { retouchTranslations } from "./domains/retouch.js";
import { effectsTranslations } from "./domains/effects.js";
import { filesTranslations } from "./domains/files.js";
import { layersTranslations } from "./domains/layers.js";
import { workspaceTranslations } from "./domains/workspace.js";
import { defineMessagePack, type MessageOverrides } from "glass-ux/i18n";
import type { ImageEditorMessages } from "../react/messages.js";

/** Ratios read the same in every language, so packs leave them to the defaults. */
type Translated = Omit<ImageEditorMessages, "aspectSquare" | "aspectFourThree" | "aspectWide">;

/** A language pack for `registerMessagePack`. A missing word is a type error here. */
export const definePack = (locale: ImageLocale, imageEditor: Translated) => defineMessagePack(locale, { imageEditor, "imageEditor.geometry": geometryTranslations[locale], "imageEditor.develop": developTranslations[locale], "imageEditor.retouch": retouchTranslations[locale], "imageEditor.effects": effectsTranslations[locale], "imageEditor.files": filesTranslations[locale], "imageEditor.layers": layersTranslations[locale], "imageEditor.workspace": workspaceTranslations[locale] } as MessageOverrides);
