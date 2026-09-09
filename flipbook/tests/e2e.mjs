/**
 * End-to-end checks for Flipbook Studio.
 *
 * Drives a real browser against `wrangler dev`, exercising the editor
 * interactions and — most importantly — proving that an exported offline build
 * renders, turns pages and loads its images with all network traffic blocked.
 *
 *   npm run build && npx wrangler dev --local &
 *   node tests/e2e.mjs
 *
 * Set CHROME_PATH to use a browser Playwright did not download itself.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { execSync } from 'node:child_process'

const BASE = process.env.BASE_URL ?? 'http://localhost:8787'
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'flipbook-e2e-'))

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

// A small PNG, written by hand so the suite needs no image fixtures on disk.
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function writeSamplePng(file, w = 320, h = 200) {
  const raw = Buffer.concat(
    Array.from({ length: h }, (_, y) => {
      const row = Buffer.alloc(1 + w * 3) // leading byte is the PNG filter type
      for (let x = 0; x < w; x++) {
        row[1 + x * 3] = (x * 255) / w
        row[2 + x * 3] = 90
        row[3 + x * 3] = (y * 255) / h
      }
      return row
    }),
  )
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

const samplePng = path.join(work, 'sample.png')
writeSamplePng(samplePng)

const browser = await chromium.launch(launchOptions)
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.canvas-viewport', { timeout: 20000 })

const field = (label) => page.locator(`.field:has(span:text-is("${label}")) input`).first()
const num = async (label) => Number(await field(label).inputValue())

console.log('\nEditor')

// --- create, resize, rotate ------------------------------------------------
await page.click('.left-tabs button:has-text("Elements")')
await page.click('.shape-grid .shape-btn >> nth=0')
const w0 = await num('W')
const h0 = await num('H')
const x0 = await num('X')
const y0 = await num('Y')
check('shape added and selected', w0 > 0 && h0 > 0)

const b = await page.locator('.canvas-page-wrap .fb-el').first().boundingBox()
const zoom = b.width / w0
await page.mouse.move(b.x + b.width, b.y + b.height)
await page.mouse.down()
await page.mouse.move(b.x + b.width + 100 * zoom, b.y + b.height + 60 * zoom, { steps: 12 })
await page.mouse.up()
check(
  'resize grows by the drag delta and pins the opposite corner',
  Math.abs((await num('W')) - (w0 + 100)) < 3 &&
    Math.abs((await num('H')) - (h0 + 60)) < 3 &&
    (await num('X')) === x0 &&
    (await num('Y')) === y0,
  `${await num('W')}x${await num('H')} at (${await num('X')},${await num('Y')})`,
)

// The rotate handle sits above the selection box; grab it where it actually is.
const rh = await page.locator('.handle-rotate').boundingBox()
const eb = await page.locator('.canvas-page-wrap .fb-el').first().boundingBox()
await page.mouse.move(rh.x + rh.width / 2, rh.y + rh.height / 2)
await page.mouse.down()
await page.mouse.move(eb.x + eb.width / 2 + 200, eb.y + eb.height / 2, { steps: 15 })
await page.mouse.up()
const rot = await num('Rotate')
check('dragging the rotate handle a quarter turn gives 90°', Math.abs(rot - 90) < 6, `${rot}°`)
await field('Rotate').fill('0')
await page.keyboard.press('Tab')

// --- marquee, layers, snapping --------------------------------------------
await page.click('.shape-grid .shape-btn >> nth=1')
await field('X').fill('700')
await page.keyboard.press('Tab')
await page.keyboard.press('Escape')

const wrap = await page.locator('.canvas-page-wrap').boundingBox()
await page.mouse.move(wrap.x + 2, wrap.y + 2)
await page.mouse.down()
await page.mouse.move(wrap.x + wrap.width - 2, wrap.y + wrap.height - 2, { steps: 15 })
await page.mouse.up()
check('marquee selects both elements', (await page.locator('.selection-outline').count()) === 2)

await page.click('.right-tabs button:has-text("Layers")')
check('layers panel lists every element', (await page.locator('.layer').count()) === 2)
await page.click('.right-tabs button:has-text("Design")')
await page.keyboard.press('Escape')

const el2 = await page.locator('.canvas-page-wrap .fb-el').first().boundingBox()
await page.mouse.move(el2.x + el2.width / 2, el2.y + el2.height / 2)
await page.mouse.down()
await page.mouse.move(el2.x + el2.width / 2 + 40, el2.y + el2.height / 2 + 40, { steps: 5 })
await page.mouse.move(wrap.x + wrap.width / 2, wrap.y + wrap.height / 2, { steps: 20 })
await page.waitForTimeout(200)
const guides = await page.locator('.snap-guide').count()
await page.mouse.up()
check('smart guides appear when an element nears the page centre', guides > 0, `${guides} guides`)

const countBefore = await page.locator('.canvas-page-wrap .fb-el').count()
await page.keyboard.press('Delete')
await page.keyboard.press('Control+z')
check('undo restores a deleted element', (await page.locator('.canvas-page-wrap .fb-el').count()) === countBefore)

// --- pages -----------------------------------------------------------------
console.log('\nPages')
const pagesBefore = await page.locator('.page-item').count()
await page.click('.page-add')
check('adding a page', (await page.locator('.page-item').count()) === pagesBefore + 1)
// Page actions are revealed on hover.
await page.locator('.page-item').first().hover()
await page.locator('.page-item').first().locator('button[title="Duplicate page"]').click()
check('duplicating a page', (await page.locator('.page-item').count()) === pagesBefore + 2)

// --- upload + reader -------------------------------------------------------
console.log('\nAssets and reader')
await page.click('.left-tabs button:has-text("Uploads")')
await page.setInputFiles('.left-body input[type=file]', samplePng)
await page.waitForSelector('.asset-card', { timeout: 20000 })
await page.click('.asset-card')
check('image uploaded and placed on the page', (await page.locator('.fb-page img').count()) > 0)

await page.click('button:has-text("Preview")')
await page.waitForSelector('.reader-book')
await page.click('.reader-bar button:has-text("Next")')
await page.waitForTimeout(900)
check('reader turns a page', (await page.locator('.reader-sheet.flipped').count()) >= 1)
await page.click('button:has-text("Close preview")')

// --- offline export --------------------------------------------------------
console.log('\nOffline export')
await page.click('button:has-text("Export offline")')
await page.waitForSelector('.modal')
await page.uncheck('.modal input[type=checkbox] >> nth=0') // no font download
const zipPath = path.join(work, 'offline.zip')
const download = page.waitForEvent('download', { timeout: 120000 })
await page.click('button:has-text("Build offline flipbook")')
await (await download).saveAs(zipPath)
check('zip built', fs.existsSync(zipPath) && fs.statSync(zipPath).size > 1000, `${fs.statSync(zipPath).size} bytes`)
await browser.close()

const outDir = path.join(work, 'offline')
fs.mkdirSync(outDir, { recursive: true })
execSync(`cd ${outDir} && unzip -o ${zipPath} > /dev/null`)
check('zip contains index.html and an assets folder',
  fs.existsSync(path.join(outDir, 'index.html')) && fs.existsSync(path.join(outDir, 'assets')))

// Open the export from file:// with every http(s) request aborted.
const offline = await chromium.launch(launchOptions)
const op = await offline.newPage({ viewport: { width: 1400, height: 900 } })
const offlineErrors = []
op.on('pageerror', (e) => offlineErrors.push(e.message))
op.on('console', (m) => m.type() === 'error' && offlineErrors.push(m.text()))
await op.route(/^https?:/, (route) => route.abort())
await op.goto('file://' + path.join(outDir, 'index.html'))
await op.waitForSelector('.fb-sheet', { timeout: 15000 })

check('pages render offline', (await op.locator('.fb-face .fb-page').count()) > 0,
  `${await op.locator('.fb-face .fb-page').count()} pages`)

const img = await op.evaluate(() => {
  const el = document.querySelector('.fb-page img')
  return el ? { src: el.getAttribute('src'), width: el.naturalWidth } : null
})
check('the bundled image loads from the relative assets path',
  Boolean(img && img.width > 0 && img.src.startsWith('assets/')), JSON.stringify(img))

const bookBox = await op.evaluate(() => {
  const r = document.querySelector('.fb-book').getBoundingClientRect()
  return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }
})
check('the book is centred in the viewport',
  Math.abs(bookBox.cx - 700) < 6 && Math.abs(bookBox.cy - 450) < 6, JSON.stringify(bookBox))

await op.click('.fb-bar button:has-text("Next")')
await op.waitForTimeout(900)
check('offline page turn', (await op.locator('.fb-sheet.flipped').count()) >= 1)

await op.click('.fb-bar button:has-text("Pages")')
await op.waitForTimeout(400)
check('offline thumbnail strip', (await op.locator('.fb-thumbs.open .fb-thumb').count()) > 0)

check('no errors with all network blocked', offlineErrors.length === 0, offlineErrors.join(' | '))
await offline.close()

const editorNoise = pageErrors.filter((e) => !/ERR_CONNECTION|Failed to fetch/.test(e))
check('no editor page errors', editorNoise.length === 0, editorNoise.join(' | '))

fs.rmSync(work, { recursive: true, force: true })
console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
