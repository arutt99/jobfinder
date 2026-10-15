import { test, expect } from "@playwright/test";
test("published artifact loads its same-origin snapshot and source coverage", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Find your next Atlassian role." }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /roles? to explore/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Source coverage", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your source coverage" }),
  ).toBeVisible();
});
