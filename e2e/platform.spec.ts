import { expect, test, type Page } from '@playwright/test'

type StoredEvent = { name: string; stream: string; handle: string | null; props: Record<string, unknown>; sample?: boolean }

async function storedEvents(page: Page): Promise<StoredEvent[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('linkup:events') ?? '[]'))
}

/** Fails the test on any uncaught page error or console error. */
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    // Google Fonts may be unreachable in CI sandboxes; that is not an app error.
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com|ERR_TUNNEL|ERR_PROXY|net::ERR/.test(m.text())) errors.push(`console: ${m.text()}`)
  })
  return errors
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('landing page leads to sign up', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'See which link they tapped.' })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await page.getByRole('link', { name: 'Make your page' }).first().click()
  await expect(page).toHaveURL(/\/signup$/)
  expect(errors).toEqual([])
})

test('a new creator signs up, builds a page, publishes it and sees a visit counted', async ({ page, context }) => {
  const errors = watchErrors(page)
  const handle = `asha${Date.now().toString(36)}`

  await page.goto('/signup')
  await page.getByLabel('Your name').fill('Asha Rao')
  await page.getByLabel('Email').fill(`${handle}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill('a-long-password')
  await page.getByRole('button', { name: 'Make my account' }).click()

  await expect(page).toHaveURL(/\/onboarding$/)
  const address = page.getByRole('textbox', { name: 'Page address' })
  await address.fill(handle)
  await expect(page.getByText(`linkup.to/${handle} is free.`)).toBeVisible()
  await page.getByRole('button', { name: 'Claim this address' }).click()

  await expect(page).toHaveURL(/\/app\/editor$/)
  await expect(page.getByRole('heading', { name: 'Your page' })).toBeVisible()

  const title = page.getByRole('textbox', { name: 'Title', exact: true }).first()
  const url = page.getByRole('textbox', { name: 'Address', exact: true }).first()
  await title.fill('My portfolio')
  await url.fill('example.com/portfolio')
  await url.blur()

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Published' })).toBeVisible()
  await expectNoHorizontalScroll(page)

  // A visitor opens the page in another tab of the same browser (the demo warehouse is per browser).
  const visitor = await context.newPage()
  const visitorErrors = watchErrors(visitor)
  await visitor.goto(`/${handle}?utm_source=instagram`)
  await expect(visitor.getByRole('heading', { name: 'Asha Rao' })).toBeVisible()
  const link = visitor.getByRole('link', { name: /My portfolio/ })
  await expect(link).toHaveAttribute('href', 'https://example.com/portfolio')
  await expectNoHorizontalScroll(visitor)

  // Turn on owner counting? No: the visitor tab shares the owner's session, so the owner's own visits are skipped by default.
  const ownEvents = (await storedEvents(visitor)).filter((e) => e.stream === 'page' && e.handle === handle)
  expect(ownEvents).toEqual([])

  // Sign out in the visitor tab's storage scope by clearing the session, then visit as a stranger.
  await visitor.evaluate(() => localStorage.removeItem('linkup:session'))
  await visitor.goto(`/${handle}?utm_source=instagram`)
  await expect(visitor.getByRole('heading', { name: 'Asha Rao' })).toBeVisible()
  const popupPromise = visitor.waitForEvent('popup')
  await visitor.getByRole('link', { name: /My portfolio/ }).click()
  const popup = await popupPromise
  await popup.close()

  await expect.poll(async () => (await storedEvents(visitor)).filter((e) => e.stream === 'page' && e.handle === handle).map((e) => e.name).sort()).toEqual(['link_click', 'page_view'])
  const view = (await storedEvents(visitor)).find((e) => e.name === 'page_view' && e.handle === handle)!
  expect((view as unknown as { context: { source: string } }).context.source).toBe('Instagram')
  expect(view.sample).toBeUndefined()

  expect(errors).toEqual([])
  expect(visitorErrors).toEqual([])
})

test('the demo account signs in and the analytics dashboard renders', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/signin')
  await page.getByRole('button', { name: 'Use the demo account' }).click()
  await expect(page).toHaveURL(/\/app\/editor$/)
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('The Design Square')

  await page.goto('/app/analytics')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText(/sample/i).first()).toBeVisible()
  await expectNoHorizontalScroll(page)
  expect(errors).toEqual([])
})

test('unknown addresses show a calm missing page', async ({ page }) => {
  await page.goto('/nobody-here-at-all')
  await expect(page.getByText(/No page at linkup\.to\/nobody-here-at-all/)).toBeVisible()
  await page.goto('/app/editor')
  await expect(page).toHaveURL(/\/signin$/)
})

test('a stranger’s click reaches the owner’s dashboard with sample data off', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/thedesignsquare')
  await expect(page.getByRole('heading', { name: 'The Design Square' })).toBeVisible()
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('link', { name: /Join the next Square/ }).click()
  await (await popupPromise).close()
  await expect.poll(async () => (await storedEvents(page)).filter((e) => e.stream === 'page').length).toBe(2)

  await page.goto('/signin')
  await page.getByRole('button', { name: 'Use the demo account' }).click()
  await expect(page).toHaveURL(/\/app\/editor$/)
  await page.goto('/app/analytics?range=7d&sample=off')
  const row = page.getByRole('row', { name: /Join the next Square/ })
  await expect(row.getByRole('cell').first()).toHaveText('1')
  await expect(page.getByRole('row', { name: /Partner with us/ }).getByRole('cell').first()).toHaveText('0')
  expect(errors).toEqual([])
})
