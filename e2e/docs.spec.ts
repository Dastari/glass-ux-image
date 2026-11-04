import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
const components = JSON.parse(
  readFileSync("src/gallery/catalogue.generated.json", "utf8"),
) as { id: string }[];
const foundations = readdirSync("src/gallery/sections")
  .filter(
    (f) =>
      f.endsWith(".meta.ts") &&
      /group:\s*"Foundations"/.test(
        readFileSync(`src/gallery/sections/${f}`, "utf8"),
      ),
  )
  .map((f) => f.replace(".meta.ts", ""));
const guides = [
  "getting-started",
  "choosing-a-level",
  "host-control",
  "hooks",
  "headless",
  "extensions",
  "files",
  "workspace",
  "accessibility",
  "performance",
  "theming",
];
const templates = [
  "single-adjustment",
  "avatar-cropper",
  "product-photo",
  "social-post",
  "annotator",
  "develop-view",
  "full-suite",
];
for (const mode of ["light", "dark"] as const)
  for (const direction of ["ltr", "rtl"] as const) {
    test.describe(`${mode} ${direction}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript(
          ({ mode }) => {
            localStorage.setItem(
              "glass-ux.appearance.v1",
              JSON.stringify({ mode, palette: "ocean", style: "glass" }),
            );
          },
          { mode },
        );
        await page.emulateMedia({ colorScheme: mode });
      });
      test("every catalogue page and live demo mounts without console errors", async ({
        page,
      }) => {
        // One test visits every page; hosted runners take about four times as long.
        test.setTimeout(process.env.CI ? 1_800_000 : 600_000);
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => {
          if (m.type() === "error") errors.push(m.text());
        });
        for (const route of [
          ...components.map((c) => `components/${c.id}`),
          ...foundations.map((id) => `foundations/${id}`),
        ]) {
          console.log(`catalogue: ${mode} ${direction} ${route}`);
          await page.goto(`${route}?dir=${direction}`);
          await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
          await expect(page.locator("html")).toHaveAttribute("dir", direction);
          await expect(
            page.locator("[data-live-demo]").first(),
            route,
          ).toBeVisible();
          await expect(
            page.getByRole("status").filter({ hasText: "Opening sample…" }),
          ).toHaveCount(0, { timeout: 15000 });
          await expect(page.locator(".docs-content")).not.toContainText(
            "could not load",
          );
          if (route.startsWith("foundations/filter-"))
            await expect(page.locator(".gi-workspace-compare img")).toHaveCount(
              2,
            );
          expect(errors, route).toEqual([]);
        }
      });
      test("guides, templates, deep links and accessibility", async ({
        page,
      }) => {
        test.setTimeout(process.env.CI ? 600_000 : 240_000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        for (const route of [
          "api/",
          "llms.txt",
          "skills/glass-ux-image-adopt/SKILL.md",
          "skills/glass-ux-image-extend/SKILL.md",
        ]) {
          expect((await page.request.get(route)).status(), route).toBe(200);
        }
        for (const id of guides) {
          const response = await page.goto(`guides/${id}/?dir=${direction}`);
          expect(response?.status()).toBe(200);
          await expect(page.locator("h1").first()).toBeVisible();
        }
        await page.goto(`guides/getting-started?dir=${direction}`);
        const levelLink = page
          .locator(".gallery-guide-document")
          .getByRole("link", { name: "choosing a level", exact: true });
        await expect(levelLink).toHaveAttribute(
          "href",
          /\/glass-ux-image\/guides\/choosing-a-level$/,
        );
        await expect(levelLink).not.toHaveAttribute("target", "_blank");
        await levelLink.click();
        await expect(page).toHaveURL(
          /\/glass-ux-image\/guides\/choosing-a-level$/,
        );
        await expect(page.locator("h1").first()).toHaveText("Choosing a level");
        for (const id of templates) {
          await page.goto(`templates/${id}/?dir=${direction}`);
          await expect(
            page.locator(`[data-live-demo="template-${id}"]`),
          ).toBeVisible();
          await expect(
            page.getByRole("heading", { name: "Source", exact: true }),
          ).toBeVisible();
          await page.getByRole("link", { name: "Open full screen" }).click();
          await expect(page).toHaveURL(new RegExp(`/templates/${id}/preview`));
          await expect(page.locator(`main[data-template="${id}"]`)).toBeVisible();
          await page.getByRole("link", { name: "Back to the template" }).click();
          await expect(page.locator(`[data-live-demo="template-${id}"]`)).toBeVisible();
        }
        // A preview is a deep link of its own on the static host.
        expect((await page.request.get("templates/full-suite/preview")).status()).toBe(200);
        for (const route of [
          "",
          "components/curves-editor",
          "guides/getting-started",
          "templates/single-adjustment",
        ]) {
          console.log(`catalogue: ${mode} ${direction} ${route}`);
          await page.goto(`${route}?dir=${direction}`);
          await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
          await expect(page.locator("html")).toHaveAttribute("dir", direction);
          await expect(page.locator("h1").first()).toBeVisible();
          expect(errors, route).toEqual([]);
          const results = await new AxeBuilder({ page }).analyze();
          expect(results.violations, route).toEqual([]);
        }
      });
      for (const [where, route] of [
        ["the landing page", ""],
        ["the full-screen application", "demo/?page=workspace&"],
      ] as const)
      test(`${where} opens an image under the deployment base`, async ({
        page,
      }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(route ? `${route}dir=${direction}` : `?dir=${direction}`);
        // The browser application owns its source and sessions. Verify actual decoded state.
        await expect
          .poll(() =>
            page.evaluate(
              () => window.__workspaceDemo?.pictures[0]?.editor.state.status,
            ),
          )
          .toBe("ready");
        await page
          .locator('input[type="file"]')
          .first()
          .setInputFiles("apps/demo/src/assets/sample.png");
        await expect
          .poll(() =>
            page.evaluate(() => window.__workspaceDemo?.pictures.length),
          )
          .toBe(2);
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                window.__workspaceDemo?.pictures.at(-1)?.editor.state.status,
            ),
          )
          .toBe("ready");
        expect(errors).toEqual([]);
      });
    });
  }
test("capture built site and check a narrow layout", async ({ page }) => {
  mkdirSync("test-results/docs/screenshots", { recursive: true });
  for (const [name, route] of [
    ["home", ""],
    ["catalogue", "components/curves-editor"],
    ["guide", "guides/getting-started"],
    ["editor", "templates/full-suite"],
  ]) {
    await page.goto(route!);
    await expect(page.locator("h1").first()).toBeVisible();
    if (name !== "home")
      await expect(
        page.locator("pre[data-highlighted]").first(),
      ).toBeAttached();
    if (name === "editor") {
      await expect(page.locator(".gi-stage").first()).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await expect
        .poll(async () =>
          Number(
            await page
              .locator('[data-testid="develop-histogram"]')
              .first()
              .getAttribute("data-weight"),
          ),
        )
        .toBeGreaterThan(0);
    }
    await page.screenshot({
      path: `test-results/docs/screenshots/${name}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("components/curves-editor");
  await expect(page.locator("[data-live-demo]").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
