import { expect, test } from "@playwright/test";
import { fillReport, knownPhone, outboxItems, photo, signInNewObserver, storedReports } from "./helpers";

test("app killed at about 40 % of a photo upload: reopened, it resumes from the server's offset; one attachment", async ({ context, page }) => {
  await knownPhone(context);
  const observer = await signInNewObserver(page);
  // About 1.5 MB after the phone re-encodes it: six 256 KiB chunks.
  const camera = photo("camera-large.jpg", 1800, 1350, 40);

  let sizeBytes = 0;
  const firstRun: number[] = [];
  let killed: () => void = () => undefined;
  const killedAt = new Promise<void>((resolve) => (killed = resolve));
  await page.route("**/api/v1/uploads/*", async (route) => {
    const request = route.request();
    if (request.method() !== "PATCH") return route.continue();
    const offset = Number(request.headers()["upload-offset"]);
    firstRun.push(offset);
    if (sizeBytes && offset + 262_144 > sizeBytes * 0.4 && firstRun.length >= 2) {
      // This chunk reaches the server, then the app dies before it hears the answer.
      await route.fetch();
      killed();
      return;
    }
    return route.continue();
  });
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/v1\/reports\/[^/]+\/uploads$/.test(new URL(request.url()).pathname)) {
      sizeBytes = JSON.parse(request.postData() ?? "{}").size_bytes;
    }
  });

  await fillReport(page, { photoPath: camera });
  await page.getByTestId("o11-send").click();
  await killedAt;
  await page.close({ runBeforeUnload: false });
  expect(sizeBytes).toBeGreaterThan(4 * 262_144);

  const serverBefore = storedReports(observer.code);
  expect(serverBefore).toHaveLength(1);
  expect(serverBefore[0].media).toHaveLength(0);
  const serverOffset = serverBefore[0].uploads[0].received_bytes;
  expect(serverOffset / sizeBytes).toBeGreaterThan(0.3);
  expect(serverOffset / sizeBytes).toBeLessThan(0.7);

  // Reopen the app on the same phone.
  const reopened = await context.newPage();
  const secondRun: Array<{ method: string; path: string; offset: string | null }> = [];
  reopened.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/v1/uploads/") || /\/uploads$/.test(path)) {
      secondRun.push({ method: request.method(), path, offset: request.headers()["upload-offset"] ?? null });
    }
  });
  await reopened.goto("/o");
  await expect.poll(async () => (await outboxItems(reopened))[0]?.media[0]?.state, { timeout: 90_000 }).toBe("saved");

  // Never restarted from zero, never a second session: the first chunk sent is at or after the server's offset.
  const patches = secondRun.filter((r) => r.method === "PATCH").map((r) => Number(r.offset));
  expect(patches.length).toBeGreaterThan(0);
  expect(Math.min(...patches)).toBeGreaterThanOrEqual(serverOffset - 262_144);
  expect(patches).not.toContain(0);
  expect(secondRun.filter((r) => r.method === "POST" && r.path.endsWith("/uploads"))).toHaveLength(0);
  // The chunk the server already had was not counted twice: the client re-read the server's offset.
  expect(patches[patches.length - 1]).toBeGreaterThanOrEqual(serverOffset);

  const reports = storedReports(observer.code);
  expect(reports).toHaveLength(1);
  expect(reports[0].media).toHaveLength(1);
  expect(reports[0].uploads).toHaveLength(1);
  expect(reports[0].uploads[0].status).toBe("completed");
  expect(reports[0].media[0].gps).toBe(false);
});
