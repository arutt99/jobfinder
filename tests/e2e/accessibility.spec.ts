import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile, mkdir } from "node:fs/promises";
test("primary dashboard and detail panel meet automated WCAG AA checks", async ({
  page,
}, info) => {
  await page.goto("./");
  await expect(page.locator(".job-card").first()).toBeVisible();
  const check = async (label: string) => {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    await mkdir("work", { recursive: true });
    await writeFile(
      `work/axe-${info.project.name}-${label}.json`,
      JSON.stringify(result.violations, null, 2),
    );
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  };
  await check("dashboard");
  await page
    .getByRole("button", {
      name: "Jira Service Management Administrator",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await check("details");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Settings & backup", exact: true })
    .click();
  await check("settings");
});
