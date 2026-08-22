import { expect, test } from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:3001';
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? `${apiOrigin}/v1`;

/**
 * Guards the api half of the `webServer` stack in playwright.config.ts. Without a
 * test that actually reaches it, the API could stop booting and every e2e would
 * still pass — the wiring would rot silently.
 */
test('the api the web app points at is up', async ({ request }) => {
  const response = await request.get(`${apiBaseUrl}/health`);

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

/**
 * CI runs `start:prod` with `NODE_ENV=production`, so Swagger must stay off.
 * Locally `webServer` boots `api dev`, where Swagger is on — skip there.
 */
test('swagger is off under the production envelope', async ({ request }) => {
  test.skip(
    !process.env.CI,
    'local webServer uses api dev (Swagger on); CI uses start:prod',
  );

  const docs = await request.get(`${apiOrigin}/docs`);
  const docsJson = await request.get(`${apiOrigin}/docs-json`);

  expect(docs.status()).toBe(404);
  expect(docsJson.status()).toBe(404);
});
