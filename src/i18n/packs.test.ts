import { describe, expect, it } from "vitest";
import { imageEditorMessages } from "../react/messages.js";
import ar from "./ar.js";
import de from "./de.js";
import es from "./es.js";
import fr from "./fr.js";
import he from "./he.js";
import it_ from "./it.js";
import ja from "./ja.js";
import ko from "./ko.js";
import nl from "./nl.js";
import ptBR from "./pt-BR.js";
import zhHans from "./zh-Hans.js";

const packs = [ar, de, es, fr, he, it_, ja, ko, nl, ptBR, zhHans];
const defaults = imageEditorMessages.defaults as Record<string, unknown>;
const ratios = ["aspectSquare", "aspectFourThree", "aspectWide"];
const messagesOf = (pack: (typeof packs)[number]) => (pack.messages as Record<string, Record<string, unknown>>).imageEditor!;

describe.each(packs.map((pack) => [pack.locale, pack] as const))("%s", (_locale, pack) => {
  const messages = messagesOf(pack);

  it("covers every message, with nothing left over", () => {
    const expected = Object.keys(defaults).filter((key) => !ratios.includes(key)).sort();
    expect(Object.keys(messages).sort()).toEqual(expected);
  });

  it("keeps each message's form, and uses every value it is given", () => {
    for (const [key, value] of Object.entries(messages)) {
      expect(typeof value, key).toBe(typeof defaults[key]);
      expect(value, key).toBeTruthy();
    }
    const fill = { x: "11", y: "22", width: "33", height: "44" };
    const readout = messagesOf(pack).cropReadout as (values: typeof fill) => string;
    for (const value of Object.values(fill)) expect(readout(fill)).toContain(value);
    expect((messages.toolSelected as (tool: string) => string)("TOOL")).toContain("TOOL");
    expect((messages.zoomPercent as (percent: string) => string)("50%")).toContain("50%");
  });

  it("is translated rather than copied", () => {
    const same = Object.keys(messages).filter((key) => typeof messages[key] === "string" && messages[key] === defaults[key]);
    expect(same.length, same.join(", ")).toBeLessThan(5);
  });
});

import { geometryMessages } from "../messages/geometry.js";
import { developMessages } from "../messages/develop.js";
import { retouchMessages } from "../messages/retouch.js";
import { effectsMessages } from "../messages/effects.js";
import { filesMessages } from "../messages/files.js";
import { layersMessages } from "../messages/layers.js";
import { workspaceMessages } from "../messages/workspace.js";
import { infoMessages } from "../messages/info.js";

describe("domain packs", () => {
  const domains = { geometry: geometryMessages, develop: developMessages, retouch: retouchMessages, effects: effectsMessages, files: filesMessages, layers: layersMessages, workspace: workspaceMessages, info: infoMessages };
  for(const pack of packs) for(const [name, descriptor] of Object.entries(domains)) {
    it(`${pack.locale} covers ${name}, including empty domains`, () => {
      const values=(pack.messages as Record<string,Record<string,unknown>>)[`imageEditor.${name}`]!;
      expect(Object.keys(values).sort()).toEqual(Object.keys(descriptor.defaults).sort());
      for(const [key,value] of Object.entries(values)) {
        expect(typeof value).toBe(typeof (descriptor.defaults as Record<string,unknown>)[key]);
        expect(value).toBeTruthy();
      }
    });
  }
});
