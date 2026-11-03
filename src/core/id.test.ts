import { afterEach, expect, it, vi } from "vitest";
import { createId } from "./id.js";

afterEach(() => vi.unstubAllGlobals());

it("works where randomUUID is missing, as on a plain HTTP page", () => {
  const { getRandomValues } = globalThis.crypto;
  vi.stubGlobal("crypto", { getRandomValues: getRandomValues.bind(globalThis.crypto) });
  const ids = new Set(Array.from({ length: 200 }, createId));
  expect(ids.size).toBe(200);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

it("uses randomUUID when it exists", () => {
  vi.stubGlobal("crypto", { randomUUID: () => "from-random-uuid", getRandomValues: () => undefined });
  expect(createId()).toBe("from-random-uuid");
});
