/**
 * Offline flipbook viewer runtime.
 *
 * The exporter pre-renders every page to static HTML (using the same style
 * helpers as the editor) and hands it over on `window.__FLIPBOOK__`. This file
 * only handles presentation: sheet stacking, page turns, navigation and chrome.
 * It has no dependencies and makes no network requests.
 */
;(function () {
  'use strict'

  var data = window.__FLIPBOOK__
  if (!data) return

  var settings = data.settings
  var pages = data.pagesHtml
  var pageCount = pages.length
  var isDouble = settings.spread === 'double'
  var sheetCount = isDouble ? Math.ceil(pageCount / 2) : pageCount

  var app = document.getElementById('fb-app')
  var stage = el('div', 'fb-stage')
  var book = el('div', 'fb-book')
  stage.appendChild(book)
  app.appendChild(stage)

  document.documentElement.style.setProperty('--fb-flip-ms', settings.flipDurationMs + 'ms')
  document.documentElement.style.setProperty(
    '--fb-ratio',
    (settings.width / settings.height).toFixed(4),
  )
  if (settings.flipStyle === 'fade') stage.classList.add('fb-fade')

  book.style.width = (isDouble ? settings.width * 2 : settings.width) + 'px'
  book.style.height = settings.height + 'px'

  /** Index of the leftmost visible sheet/page. */
  var cursor = 0
  var busy = false
  var sheets = []
  var singleEls = []

  if (isDouble) buildSheets()
  else buildSingle()

  var chrome = buildChrome()
  buildThumbs()
  layout()
  render()

  window.addEventListener('resize', layout)
  window.addEventListener('keydown', onKey)
  bindDragToTurn()

  // -----------------------------------------------------------------------

  function buildSheets() {
    for (var k = 0; k < sheetCount; k++) {
      var sheet = el('div', 'fb-sheet')
      sheet.style.width = settings.width + 'px'
      sheet.style.height = settings.height + 'px'

      var front = face('front', pages[2 * k], 2 * k)
      sheet.appendChild(front)

      var backIndex = 2 * k + 1
      var back = face('back', backIndex < pageCount ? pages[backIndex] : '', backIndex)
      sheet.appendChild(back)

      book.appendChild(sheet)
      sheets.push(sheet)
    }
  }

  function face(kind, html, pageIndex) {
    var f = el('div', 'fb-face ' + kind)
    f.style.width = settings.width + 'px'
    f.style.height = settings.height + 'px'
    f.innerHTML = html
    if (settings.showPageNumbers && pageIndex < pageCount) {
      var no = el('div', 'fb-page-number')
      no.textContent = String(pageIndex + 1)
      f.appendChild(no)
    }
    return f
  }

  function buildSingle() {
    for (var i = 0; i < pageCount; i++) {
      var p = el('div', 'fb-single')
      p.style.width = settings.width + 'px'
      p.style.height = settings.height + 'px'
      p.innerHTML = pages[i]
      if (settings.showPageNumbers) {
        var no = el('div', 'fb-page-number')
        no.textContent = String(i + 1)
        p.appendChild(no)
      }
      book.appendChild(p)
      singleEls.push(p)
    }
  }

  function render() {
    if (isDouble) {
      for (var k = 0; k < sheets.length; k++) {
        var flipped = k < cursor
        sheets[k].classList.toggle('flipped', flipped)
        // Unflipped sheets stack front-to-back; flipped ones stack in reverse.
        sheets[k].style.zIndex = String(flipped ? k : sheetCount - k)
      }
    } else {
      for (var i = 0; i < singleEls.length; i++) {
        var state = i === cursor ? 'in' : i < cursor ? 'out-left' : 'out-right'
        singleEls[i].setAttribute('data-state', state)
        singleEls[i].style.zIndex = String(i === cursor ? 2 : 1)
        singleEls[i].style.pointerEvents = i === cursor ? 'auto' : 'none'
      }
    }
    replayAnimations()
    updateChrome()
  }

  /** Restart entrance animations for whatever just became visible. */
  function replayAnimations() {
    var visible = isDouble
      ? [pageEl(2 * cursor - 1), pageEl(2 * cursor)]
      : [singleEls[cursor]]
    visible.forEach(function (node) {
      if (!node) return
      var animated = node.querySelectorAll('[data-anim]')
      for (var i = 0; i < animated.length; i++) {
        var a = animated[i]
        a.style.animation = 'none'
        // Force a reflow so the animation restarts from the first frame.
        void a.offsetWidth
        a.style.animation = ''
      }
    })
  }

  function pageEl(index) {
    if (index < 0 || index >= pageCount) return null
    var sheet = sheets[Math.floor(index / 2)]
    if (!sheet) return null
    return sheet.children[index % 2 === 0 ? 0 : 1]
  }

  function go(delta) {
    if (busy) return
    var max = isDouble ? sheetCount : pageCount - 1
    var next = Math.max(0, Math.min(cursor + delta, max))
    if (next === cursor) return
    cursor = next
    busy = true
    render()
    setTimeout(function () {
      busy = false
    }, settings.flipDurationMs)
  }

  function goTo(pageIndex) {
    cursor = isDouble ? Math.ceil(pageIndex / 2) : pageIndex
    render()
  }

  function layout() {
    var pad = window.innerWidth < 720 ? 16 : 72
    var bookW = isDouble ? settings.width * 2 : settings.width
    var scale = Math.min(
      (stage.clientWidth - pad) / bookW,
      (stage.clientHeight - pad - 70) / settings.height,
    )
    // The centring translate must survive, or the scaled book drifts off-stage.
    book.style.transform = 'translate(-50%, -50%) scale(' + Math.max(scale, 0.02) + ')'
  }

  function onKey(e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault()
      go(1)
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault()
      go(-1)
    } else if (e.key === 'Home') {
      cursor = 0
      render()
    } else if (e.key === 'End') {
      cursor = isDouble ? sheetCount : pageCount - 1
      render()
    } else if (e.key === 'f') {
      toggleFullscreen()
    }
  }

  /**
   * Drag-to-turn.
   *
   * The sheet follows the pointer instead of waiting for a flick to end, and on
   * release either completes the turn or springs back. This mirrors
   * `src/lib/pageTurn.ts` in the editor — keep the two in step so an exported
   * book reads exactly like the preview.
   */
  var DRAG_SLOP_PX = 6
  var TURN_COMMIT_RATIO = 0.35
  var TURN_FLICK_VELOCITY = 0.5

  function turnProgress(dx, pageWidth, direction) {
    if (pageWidth <= 0) return 0
    var travelled = direction === 'forward' ? -dx : dx
    return Math.max(0, Math.min(1, travelled / pageWidth))
  }

  function turnAngle(progress, direction) {
    return direction === 'forward' ? -180 * progress : -180 * (1 - progress)
  }

  function shouldCommit(progress, velocity, pageWidth, direction) {
    if (progress >= TURN_COMMIT_RATIO) return true
    if (pageWidth <= 0) return false
    var towards = direction === 'forward' ? -velocity : velocity
    return (towards * 1000) / pageWidth >= TURN_FLICK_VELOCITY
  }

  function turnShadow(progress) {
    return Math.sin(Math.PI * Math.min(1, Math.max(0, progress))) * 0.35
  }

  /** On-screen width of one page, which changes with the fit-to-window scale. */
  function pageWidthPx() {
    return book.getBoundingClientRect().width / (isDouble ? 2 : 1)
  }

  function bindDragToTurn() {
    var g = null

    book.addEventListener('pointerdown', function (e) {
      if (busy) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      var rect = book.getBoundingClientRect()
      var forward = e.clientX - rect.left > rect.width / 2
      var direction = forward ? 'forward' : 'back'
      // Only start a drag when the turn has somewhere to go.
      var maxCursor = isDouble ? sheetCount : pageCount - 1
      var nextCursor = cursor + (forward ? 1 : -1)
      if (nextCursor < 0 || nextCursor > maxCursor) return

      // In a book it is the sheet being lifted that moves; on single pages the
      // page under the finger slides.
      var index = isDouble ? (forward ? cursor : cursor - 1) : cursor
      if (index < 0 || index >= (isDouble ? sheetCount : pageCount)) return

      g = {
        id: e.pointerId,
        startX: e.clientX,
        lastX: e.clientX,
        lastT: performance.now(),
        velocity: 0,
        direction: direction,
        index: index,
        active: false,
      }
      // Capture keeps the drag alive past the book's edge. The spec has it throw
      // when the pointer is already gone, which must not break the gesture.
      try {
        book.setPointerCapture(e.pointerId)
      } catch (err) {
        // Continue without capture; the drag still tracks pointermove.
      }
    })

    book.addEventListener('pointermove', function (e) {
      if (!g || g.id !== e.pointerId) return
      var dx = e.clientX - g.startX
      if (!g.active && Math.abs(dx) < DRAG_SLOP_PX) return
      g.active = true

      var now = performance.now()
      var dt = Math.max(1, now - g.lastT)
      g.velocity = (e.clientX - g.lastX) / dt
      g.lastX = e.clientX
      g.lastT = now

      var progress = turnProgress(dx, pageWidthPx(), g.direction)
      applyDrag(g, progress)
    })

    function release(e) {
      if (!g || g.id !== e.pointerId) return
      var held = g
      g = null
      if (!held.active) {
        clearDrag(held)
        return
      }
      var progress = turnProgress(e.clientX - held.startX, pageWidthPx(), held.direction)
      var commit = shouldCommit(progress, held.velocity, pageWidthPx(), held.direction)
      clearDrag(held)
      if (commit) go(held.direction === 'forward' ? 1 : -1)
    }

    book.addEventListener('pointerup', release)
    book.addEventListener('pointercancel', release)

    function target(held) {
      return isDouble ? sheets[held.index] : singleEls[held.index]
    }

    function applyDrag(held, progress) {
      var node = target(held)
      if (!node) return
      node.style.transition = 'none'
      node.style.zIndex = String(sheetCount + pageCount + 1)
      if (isDouble) {
        node.style.transform = 'rotateY(' + turnAngle(progress, held.direction) + 'deg)'
        node.style.filter =
          'drop-shadow(0 0 ' + 40 * turnShadow(progress) + 'px rgba(0,0,0,.5))'
      } else {
        var shift = held.direction === 'forward' ? -progress : progress
        node.style.transform = 'translateX(' + shift * 100 + '%)'
        node.style.opacity = '1'
      }
    }

    function clearDrag(held) {
      var node = target(held)
      if (!node) return
      node.style.transition = ''
      node.style.transform = ''
      node.style.filter = ''
      node.style.opacity = ''
      node.style.zIndex = ''
      render()
    }
  }

  function buildChrome() {
    var prevZone = el('button', 'fb-nav prev')
    prevZone.setAttribute('aria-label', 'Previous page')
    prevZone.onclick = function () {
      go(-1)
    }
    var nextZone = el('button', 'fb-nav next')
    nextZone.setAttribute('aria-label', 'Next page')
    nextZone.onclick = function () {
      go(1)
    }
    stage.appendChild(prevZone)
    stage.appendChild(nextZone)

    var bar = el('div', 'fb-bar')
    var first = button('⏮', 'First page', function () {
      cursor = 0
      render()
    })
    var prev = button('‹ Prev', 'Previous page', function () {
      go(-1)
    })
    var counter = el('span', 'fb-counter')
    var next = button('Next ›', 'Next page', function () {
      go(1)
    })
    var last = button('⏭', 'Last page', function () {
      cursor = isDouble ? sheetCount : pageCount - 1
      render()
    })
    var thumbsBtn = button('Pages', 'Toggle page thumbnails', function () {
      // The app class lifts the control bar clear of the open strip.
      app.classList.toggle('thumbs-open', thumbsEl.classList.toggle('open'))
    })
    var printBtn = button('Print / PDF', 'Print or save as PDF', function () {
      window.print()
    })
    var fsBtn = button('⛶', 'Fullscreen', toggleFullscreen)

    bar.appendChild(first)
    bar.appendChild(prev)
    bar.appendChild(counter)
    bar.appendChild(next)
    bar.appendChild(last)
    bar.appendChild(el('div', 'fb-sep'))
    bar.appendChild(thumbsBtn)
    bar.appendChild(printBtn)
    bar.appendChild(fsBtn)
    app.appendChild(bar)

    var hint = el('div', 'fb-hint')
    hint.textContent = 'Click the page edges, swipe, or use ← → to turn pages'
    app.appendChild(hint)
    requestAnimationFrame(function () {
      hint.classList.add('hide')
    })

    return { counter: counter, prev: prev, next: next, first: first, last: last }
  }

  var thumbsEl
  function buildThumbs() {
    thumbsEl = el('div', 'fb-thumbs')
    for (var i = 0; i < pageCount; i++) {
      ;(function (index) {
        var t = el('button', 'fb-thumb')
        var inner = el('div', '')
        inner.style.width = settings.width + 'px'
        inner.style.height = settings.height + 'px'
        inner.innerHTML = pages[index]
        // The thumbnail scale is applied once the strip has a measured height.
        t.appendChild(inner)
        var no = el('span', 'fb-thumb-no')
        no.textContent = String(index + 1)
        t.appendChild(no)
        t.onclick = function () {
          goTo(index)
        }
        t.__inner = inner
        thumbsEl.appendChild(t)
      })(i)
    }
    app.appendChild(thumbsEl)

    // Scale thumbnail contents to the strip height after first paint.
    requestAnimationFrame(function () {
      var h = 148 - 28
      var scale = h / settings.height
      var nodes = thumbsEl.querySelectorAll('.fb-thumb')
      for (var i = 0; i < nodes.length; i++) {
        var inner = nodes[i].__inner
        inner.style.transformOrigin = 'top left'
        inner.style.transform = 'scale(' + scale + ')'
        inner.style.position = 'absolute'
        inner.style.top = '0'
        inner.style.left = '0'
      }
    })
  }

  function updateChrome() {
    var max = isDouble ? sheetCount : pageCount - 1
    chrome.prev.disabled = cursor <= 0
    chrome.first.disabled = cursor <= 0
    chrome.next.disabled = cursor >= max
    chrome.last.disabled = cursor >= max
    if (isDouble) {
      // Page numbers either side of the spine: the first spread shows the cover
      // alone, and the last spread may have no right-hand page.
      var left = 2 * cursor
      var right = left + 1
      var label
      if (left === 0) label = '1 / ' + pageCount
      else if (right > pageCount) label = left + ' / ' + pageCount
      else label = left + '\u2013' + right + ' / ' + pageCount
      chrome.counter.textContent = label
    } else {
      chrome.counter.textContent = cursor + 1 + ' / ' + pageCount
    }
    var thumbs = thumbsEl.querySelectorAll('.fb-thumb')
    var activeIndex = isDouble ? Math.max(0, 2 * cursor - 1) : cursor
    for (var i = 0; i < thumbs.length; i++) {
      thumbs[i].classList.toggle('active', i === activeIndex)
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen()
  }

  function button(label, title, onClick) {
    var b = el('button', '')
    b.textContent = label
    b.title = title
    b.setAttribute('aria-label', title)
    b.onclick = onClick
    return b
  }

  function el(tag, className) {
    var node = document.createElement(tag)
    if (className) node.className = className
    return node
  }
})()
