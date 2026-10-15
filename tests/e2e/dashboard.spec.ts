import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Find your next Atlassian role." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /roles to explore/ }),
  ).toBeVisible();
});
test("loads a labeled demo without browser errors and fits the screen", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByText("Every role is synthetic.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".job-card")).toHaveCount(13);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mkdir("work", { recursive: true });
  await page.screenshot({
    path: `work/${info.project.name}-dashboard.png`,
    fullPage: false,
  });
  expect(errors).toEqual([]);
});
test("searches, explains matches and restores keyboard focus", async ({
  page,
}) => {
  await page.getByRole("textbox", { name: "Search roles" }).fill("Evergreen");
  await expect(page.locator(".job-card")).toHaveCount(1);
  const button = page.getByRole("button", {
    name: "Jira Service Management Administrator",
    exact: true,
  });
  await button.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Role details" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Why this matched" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Synthetic example · this is not an open vacancy."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(button).toBeFocused();
});
test("saves a role, notes and application progress across reload", async ({
  page,
}) => {
  await page.getByRole("textbox", { name: "Search roles" }).fill("Evergreen");
  await page
    .getByRole("button", {
      name: "Save Jira Service Management Administrator",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Jira Service Management Administrator",
      exact: true,
    })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Application stage").selectOption("applied");
  await d.getByLabel("Private notes").fill("Ask about the platform roadmap");
  await page.keyboard.press("Escape");
  expect(page.url()).not.toContain("applied");
  expect(page.url()).not.toContain("roadmap");
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Unsave Jira Service Management Administrator",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: "Jira Service Management Administrator",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Private notes")).toHaveValue(
    "Ask about the platform roadmap",
  );
});
test("combines remote geography filters and resets empty results", async ({
  page,
}, info) => {
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Remote", { exact: true }).check();
  await page.getByText("Remote eligibility", { exact: true }).click();
  await page.getByLabel("Worldwide", { exact: true }).check();
  await expect(page.locator(".job-card")).toHaveCount(2);
  await page
    .getByRole("textbox", { name: "Search roles" })
    .fill("not-a-real-company");
  await expect(
    page.getByRole("heading", { name: "No roles match these filters." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(page.locator(".job-card")).toHaveCount(13);
});
test("validates backup import with preview and supports browser-local manual roles", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Settings & backup", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Import personal backup").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(d.getByRole("status")).toContainText("not a valid");
  await d.getByLabel("Import personal backup").setInputFiles({
    name: "valid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ schemaVersion: 1, entries: {}, manual: [] }),
    ),
  });
  await expect(
    d.getByRole("heading", { name: "Ready to merge" }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Merge backup" }).click();
  await expect(d.getByRole("status")).toContainText(
    "Backup merged successfully",
  );
  await d.getByLabel("Job title", { exact: true }).fill("Jira Administrator");
  await d.getByLabel("Company", { exact: true }).fill("My own lead");
  await d
    .getByLabel("Original posting URL")
    .fill("https://example.com/career?id=15");
  await d.getByRole("button", { name: "Save manual role" }).click();
  await expect(d.getByRole("status")).toContainText("Manual role saved");
  await d.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Saved roles", exact: true }).click();
  await expect(
    page.locator(".job-card").filter({ hasText: "My own lead" }),
  ).toBeVisible();
});
test("source coverage states limits and external searches are manual links", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Source coverage", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your source coverage" }),
  ).toBeVisible();
  await expect(page.locator(".source-card")).toHaveCount(3);
  await expect(
    page.getByText("No live sources are enabled in the supplied registry.", {
      exact: false,
    }),
  ).toBeVisible();
  const link = page.getByRole("link", { name: "Google Open external search" });
  await expect(link).toHaveAttribute("href", /google.com\/search\?q=/);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});
test("shows a readable corruption error instead of crashing", async ({
  page,
}) => {
  await page.route("**/data/jobs.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.getByRole("button", { name: "Reload data" }).click();
  await expect(page.getByRole("alert")).toContainText("integrity check failed");
  await expect(page.locator(".job-card")).toHaveCount(13);
});
