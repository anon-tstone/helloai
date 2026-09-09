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

/** Records a short, genuinely decodable .webm to use as a video fixture. */
async function makeSampleVideo(file) {
  const rec = await chromium.launch(launchOptions)
  const dir = path.join(work, 'rec')
  const recCtx = await rec.newContext({
    recordVideo: { dir, size: { width: 320, height: 180 } },
    viewport: { width: 320, height: 180 },
  })
  const recPage = await recCtx.newPage()
  await recPage.setContent(
    '<body style="margin:0;background:#6c5ce7"><h1 style="color:#fff;font:700 26px sans-serif;padding:40px">Sample clip</h1></body>',
  )
  await recPage.waitForTimeout(1200)
  await recCtx.close()
  await rec.close()
  const recorded = fs.readdirSync(dir).find((f) => f.endsWith('.webm'))
  fs.copyFileSync(path.join(dir, recorded), file)
}

const sampleVideo = path.join(work, 'sample.webm')
await makeSampleVideo(sampleVideo)

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

// --- drag-to-turn -----------------------------------------------------------
console.log('\nDrag to turn')
await page.click('.reader-bar button:has-text("⏮")')
await page.waitForTimeout(900)
const readerBook = await page.locator('.reader-book').boundingBox()
const halfPage = readerBook.width / 2
const midY = readerBook.y + readerBook.height / 2
const rightPageX = readerBook.x + readerBook.width * 0.75
const leftPageX = readerBook.x + readerBook.width * 0.25

// A short drag lifts the sheet, then springs back on release.
await page.mouse.move(rightPageX, midY)
await page.mouse.down()
await page.mouse.move(rightPageX - halfPage * 0.12, midY, { steps: 10 })
const midDrag = await page.evaluate(
  () => getComputedStyle(document.querySelector('.reader-sheet')).transform,
)
check('the sheet follows the pointer mid-drag',
  Boolean(midDrag && midDrag !== 'none' && midDrag !== 'matrix(1, 0, 0, 1, 0, 0)'))
await page.mouse.up()
await page.waitForTimeout(900)
check('a short drag springs back instead of turning',
  (await page.locator('.reader-sheet.flipped').count()) === 0)

// Past the commit ratio the turn completes.
await page.mouse.move(rightPageX, midY)
await page.mouse.down()
await page.mouse.move(rightPageX - halfPage * 0.6, midY, { steps: 14 })
await page.mouse.up()
await page.waitForTimeout(1000)
check('a long drag completes the turn',
  (await page.locator('.reader-sheet.flipped').count()) === 1)

// Dragging the left-hand page goes back.
await page.mouse.move(leftPageX, midY)
await page.mouse.down()
await page.mouse.move(leftPageX + halfPage * 0.6, midY, { steps: 14 })
await page.mouse.up()
await page.waitForTimeout(1000)
check('dragging the left page turns back',
  (await page.locator('.reader-sheet.flipped').count()) === 0)

// Drag slop must leave taps working.
await page.click('.reader-zone.next')
await page.waitForTimeout(900)
check('a tap on the page edge still turns the page',
  (await page.locator('.reader-sheet.flipped').count()) === 1)
await page.click('button:has-text("Close preview")')

// --- pinch to zoom ----------------------------------------------------------
console.log('\nTouch gestures')
const zoomBefore = parseInt(await page.locator('.zoom-badge span').textContent(), 10)
const canvasBox = await page.locator('.canvas-viewport').boundingBox()
await page.evaluate(([cx, cy]) => {
  const el = document.elementFromPoint(cx, cy)
  const send = (type, points) => {
    for (const pt of points) {
      el.dispatchEvent(new PointerEvent(type, {
        pointerId: pt.id, pointerType: 'touch', isPrimary: pt.id === 1,
        clientX: pt.x, clientY: pt.y, bubbles: true, cancelable: true, button: 0,
      }))
    }
  }
  send('pointerdown', [{ id: 1, x: cx - 60, y: cy }, { id: 2, x: cx + 60, y: cy }])
  send('pointermove', [{ id: 1, x: cx - 160, y: cy }, { id: 2, x: cx + 160, y: cy }])
  send('pointerup', [{ id: 1, x: cx - 160, y: cy }, { id: 2, x: cx + 160, y: cy }])
}, [canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2])
await page.waitForTimeout(300)
const zoomAfter = parseInt(await page.locator('.zoom-badge span').textContent(), 10)
check('two fingers spreading zooms the canvas in', zoomAfter > zoomBefore,
  `${zoomBefore}% -> ${zoomAfter}%`)

// Leave the canvas where it started: the drop-position checks below measure the
// page on screen, and a zoomed-in page pushes their target off the viewport.
for (let i = 0; i < 30; i++) {
  const now = parseInt(await page.locator('.zoom-badge span').textContent(), 10)
  if (now <= zoomBefore) break
  await page.click('.zoom-badge button[title="Zoom out"]')
}

// --- themes ----------------------------------------------------------------
console.log('\nThemes')
await page.click('.left-tabs button:has-text("Design")')
await page.click('.template-card:has-text("Title + body")')
const inkBefore = await page.evaluate(
  () => getComputedStyle(document.querySelector('.fb-page .fb-el div')).color,
)
const surfaceBefore = await page.evaluate(
  () => getComputedStyle(document.querySelector('.canvas-page-wrap .fb-page')).background,
)

await page.click('.left-tabs button:has-text("Themes")')
check('theme presets are listed', (await page.locator('.theme-card').count()) >= 5)
await page.click('.theme-card:has-text("Midnight")')
await page.waitForTimeout(300)
check('applying a theme repaints the page surface',
  surfaceBefore !== (await page.evaluate(
    () => getComputedStyle(document.querySelector('.canvas-page-wrap .fb-page')).background)))
check('applying a theme restyles template text',
  inkBefore !== (await page.evaluate(
    () => getComputedStyle(document.querySelector('.fb-page .fb-el div')).color)))

// A colour the author picked must not be swept up by the next theme change.
await page.click('.left-tabs button:has-text("Elements")')
await page.click('.shape-grid .shape-btn >> nth=0')
await page.locator('.right-body input[type=color]').first().fill('#ff0000')
await page.click('.left-tabs button:has-text("Themes")')
await page.click('.theme-card:has-text("Editorial")')
await page.waitForTimeout(300)
check('a hand-picked colour survives a theme change', await page.evaluate(() =>
  [...document.querySelectorAll('.canvas-page-wrap .fb-el[data-type="shape"] div')]
    .some((el) => getComputedStyle(el).backgroundColor === 'rgb(255, 0, 0)')))
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)
check('undo reverts a theme change',
  (await page.locator('.theme-card.active:has-text("Midnight")').count()) === 1)

// --- paper texture ---------------------------------------------------------
console.log('\nPaper texture')
await page.click('.left-tabs button:has-text("Background")')
check('paper stock picker is present', (await page.locator('.paper-card').count()) === 6)
await page.click('.paper-card:has-text("Plain")')
await page.waitForTimeout(150)
check('plain stock renders no texture layer',
  (await page.locator('.canvas-page-wrap .fb-paper').count()) === 0)

for (const kind of ['Linen', 'Fibre', 'Grain', 'Dots', 'Grid']) {
  await page.click(`.paper-card:has-text("${kind}")`)
  await page.waitForTimeout(150)
  const img = await page.evaluate(() => {
    const el = document.querySelector('.canvas-page-wrap .fb-paper')
    return el ? getComputedStyle(el).backgroundImage : null
  })
  check(`${kind} paper renders`, Boolean(img && img !== 'none'))
}

await page.click('.paper-card:has-text("Linen")')
await page.locator('.field:has(span:text-is("Strength %")) input').fill('35')
await page.locator('.field:has(span:text-is("Scale px")) input').fill('60')
await page.waitForTimeout(250)
check('paper strength and scale reach the page', await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.canvas-page-wrap .fb-paper'))
  return cs.opacity === '0.35' && cs.backgroundImage.includes('10px')
}))

// --- animation -------------------------------------------------------------
console.log('\nAnimation')
await page.click('.right-tabs button:has-text("Layers")')
await page.locator('.layer').first().click()
await page.click('.right-tabs button:has-text("Design")')
check('the effect picker offers named effects',
  (await page.locator('.anim-grid button').count()) === 10)
await page.click('.anim-grid button:has-text("Rise")')
check('choosing an effect reveals the start and speed controls',
  (await page.locator('.field:has(span:text-is("Starts"))').count()) === 1 &&
  (await page.locator('.field:has(span:text-is("Speed"))').count()) === 1)

await page.click('button:has-text("Animate every element in order")')
await page.waitForTimeout(300)
await page.click('button:has-text("Play on this page")')
await page.waitForTimeout(120)
check('Play previews the sequence on the canvas', await page.evaluate(
  () => getComputedStyle(document.querySelector('.canvas-page-wrap .fb-el')).animationName) !== 'none')
// Poll rather than guess: the sequence length depends on how many elements
// this page happens to be carrying by now.
const wentStatic = await page
  .waitForFunction(
    () =>
      [...document.querySelectorAll('.canvas-page-wrap .fb-el')].every(
        (el) => getComputedStyle(el).animationName === 'none',
      ),
    null,
    { timeout: 8000 },
  )
  .then(() => true)
  .catch(() => false)
check('the canvas goes static once the sequence ends', wentStatic)

await page.click('button:has-text("Preview")')
await page.waitForSelector('.reader-book')
// Delays are per page, so look for a page whose animated elements step
// forward in time — reading every face at once would mix in unanimated ones.
const sequencedPage = await page.evaluate(() =>
  [...document.querySelectorAll('.reader-face')].some((face) => {
    const delays = [...face.querySelectorAll('.fb-el')]
      .filter((el) => getComputedStyle(el).animationName !== 'none')
      .map((el) => parseFloat(getComputedStyle(el).animationDelay))
    return delays.length >= 2 && delays.every((d, i) => i === 0 || d > delays[i - 1])
  }))
check('a page plays its elements in sequence, with no hand-typed delays', sequencedPage)
await page.click('button:has-text("Close preview")')

// --- viewer backdrop -------------------------------------------------------
console.log('\nViewer backdrop')
await page.click('.right-tabs button:has-text("Document")')
await page.locator('.field:has(span:text-is("Backdrop style")) select').selectOption('linear')
await page.locator('.field:has(span:text-is("From")) input').first().fill('#ff8800')
await page.locator('.field:has(span:text-is("To")) input').first().fill('#220044')
await page.waitForTimeout(200)
await page.click('button:has-text("Preview")')
await page.waitForSelector('.reader-book')
check('the reader renders a gradient backdrop', (await page.evaluate(
  () => getComputedStyle(document.querySelector('.reader')).backgroundImage)).includes('linear-gradient'))
await page.click('button:has-text("Close preview")')
await page.click('.right-tabs button:has-text("Design")')

// --- video and drag-and-drop ------------------------------------------------
console.log('\nVideo and drag-and-drop')
await page.click('.left-tabs button:has-text("Uploads")')
await page.setInputFiles('.left-body input[type=file]', sampleVideo)
await page.waitForSelector('.asset-card video', { timeout: 25000 })
await page.locator('.asset-card').filter({ has: page.locator('video') }).click()
await page.waitForTimeout(300)
const placedVideo = await page.evaluate(() => {
  const el = document.querySelector('.canvas-page-wrap .fb-el[data-type="video"] video')
  return el ? { tag: el.tagName, w: el.clientWidth, h: el.clientHeight } : null
})
check('a video asset is placed as a video element, not an image',
  placedVideo?.tag === 'VIDEO', JSON.stringify(placedVideo))
check('video keeps its real aspect ratio',
  placedVideo ? Math.abs(placedVideo.w / placedVideo.h - 320 / 180) < 0.1 : false)
check('the video inspector is shown',
  (await page.locator('.inspector-group:has(h4:text-is("Video"))').count()) === 1)

await page.keyboard.press('Delete')
const dropWrap = await page.locator('.canvas-page-wrap').boundingBox()
const dropX = dropWrap.x + dropWrap.width * 0.25
const dropY = dropWrap.y + dropWrap.height * 0.75
await page.locator('.asset-card').filter({ has: page.locator('video') }).hover()
await page.mouse.down()
await page.mouse.move(dropX, dropY, { steps: 20 })
const dropOverlay = await page.locator('.drop-target-overlay').count()
await page.mouse.up()
await page.waitForTimeout(400)
check('a drop affordance appears while dragging over the page', dropOverlay === 1)
const droppedAt = await page.evaluate(() => {
  const el = document.querySelector('.canvas-page-wrap .fb-el[data-type="video"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
})
check('a dragged asset lands where it was dropped',
  droppedAt ? Math.abs(droppedAt.cx - dropX) < 25 && Math.abs(droppedAt.cy - dropY) < 25 : false)

// Applying a template replaces the page contents, so put the image back before
// exporting — the export checks below expect both media types to be present.
await page.locator('.asset-card').filter({ has: page.locator('img') }).first().click()
await page.waitForTimeout(200)

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
const offlineVideo = await op.evaluate(() => {
  const v = document.querySelector('.fb-page video')
  return v ? { src: v.getAttribute('src'), width: v.videoWidth } : null
})
check('the bundled video loads from the relative assets path',
  Boolean(offlineVideo && offlineVideo.src.startsWith('assets/')), JSON.stringify(offlineVideo))

check('the bundled image loads from the relative assets path',
  Boolean(img && img.width > 0 && img.src.startsWith('assets/')), JSON.stringify(img))

const bookBox = await op.evaluate(() => {
  const r = document.querySelector('.fb-book').getBoundingClientRect()
  return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }
})
// Entrance timings must survive into the export — the runtime used to wipe
// them when it reset the animation shorthand.
const offlineDelays = await op.evaluate(() =>
  [...document.querySelectorAll('.fb-face .fb-el[data-anim]')]
    .map((el) => parseFloat(getComputedStyle(el).animationDelay)))
check('the exported book carries the computed animation sequence',
  offlineDelays.length >= 2 && offlineDelays.some((d) => d > 0),
  offlineDelays.join('s, ') + 's')

check('the offline book keeps its paper texture', await op.evaluate(() => {
  const el = document.querySelector('.fb-face .fb-paper')
  return Boolean(el && getComputedStyle(el).backgroundImage !== 'none')
}))

check('the offline export carries the gradient backdrop',
  (await op.evaluate(() => getComputedStyle(document.body).backgroundImage)).includes('linear-gradient'))

check('the book is centred in the viewport',
  Math.abs(bookBox.cx - 700) < 6 && Math.abs(bookBox.cy - 450) < 6, JSON.stringify(bookBox))

await op.click('.fb-bar button:has-text("Next")')
await op.waitForTimeout(900)
check('offline page turn', (await op.locator('.fb-sheet.flipped').count()) >= 1)

await op.click('.fb-bar button:has-text("Pages")')
await op.waitForTimeout(400)
check('offline thumbnail strip', (await op.locator('.fb-thumbs.open .fb-thumb').count()) > 0)

// The control bar must stay reachable while the thumbnail strip is open.
check('the open thumbnail strip does not bury the controls', await op.evaluate(() => {
  const bar = document.querySelector('.fb-bar').getBoundingClientRect()
  const strip = document.querySelector('.fb-thumbs').getBoundingClientRect()
  return bar.bottom <= strip.top + 1
}))

// A real touch drag must turn the page in the exported book too.
await op.click('.fb-bar button:has-text("Pages")')
await op.click('.fb-bar button:has-text("⏮")')
await op.waitForTimeout(900)
const offBook = await op.locator('.fb-book').boundingBox()
await op.evaluate(([x, y, w]) => {
  const el = document.querySelector('.fb-book')
  const send = (type, cx) => el.dispatchEvent(new PointerEvent(type, {
    pointerId: 7, pointerType: 'touch', isPrimary: true,
    clientX: cx, clientY: y, bubbles: true, cancelable: true, button: 0,
  }))
  send('pointerdown', x)
  send('pointermove', x - w * 0.2)
  send('pointermove', x - w * 0.7)
  send('pointerup', x - w * 0.7)
}, [offBook.x + offBook.width * 0.75, offBook.y + offBook.height / 2, offBook.width / 2])
await op.waitForTimeout(1100)
check('a touch drag turns the page in the exported book',
  (await op.locator('.fb-sheet.flipped').count()) >= 1)

check('no errors with all network blocked', offlineErrors.length === 0, offlineErrors.join(' | '))
await offline.close()

const editorNoise = pageErrors.filter((e) => !/ERR_CONNECTION|Failed to fetch/.test(e))
check('no editor page errors', editorNoise.length === 0, editorNoise.join(' | '))

fs.rmSync(work, { recursive: true, force: true })
console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
