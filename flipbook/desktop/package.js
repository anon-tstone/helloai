#!/usr/bin/env node
/**
 * Turns an exported flipbook into a desktop application.
 *
 *   node package.js <book.zip | folder | book.html> [options]
 *
 *   --platform  win32 | darwin | linux   (default: this machine)
 *   --arch      x64 | arm64              (default: this machine)
 *   --name      window and file name     (default: taken from the book)
 *   --icon      .ico / .icns / .png
 *   --out       output directory         (default: ./dist-desktop)
 *
 * Windows binaries can be produced from macOS or Linux; embedding a custom
 * Windows icon is the one step that additionally needs wine on those hosts.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const here = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const [input, ...rest] = argv
  const options = {
    input,
    platform: process.platform,
    arch: process.arch,
    out: path.join(here, 'dist-desktop'),
    name: null,
    icon: null,
  }
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].replace(/^--/, '')
    const value = rest[i + 1]
    if (key in options && value) options[key] = value
  }
  return options
}

/** Copies the book into the staging folder, whatever shape it arrived in. */
async function stageContent(input, contentDir) {
  await fs.rm(contentDir, { recursive: true, force: true })
  await fs.mkdir(contentDir, { recursive: true })

  const stat = await fs.stat(input)

  if (stat.isDirectory()) {
    await fs.cp(input, contentDir, { recursive: true })
  } else if (input.toLowerCase().endsWith('.zip')) {
    const zip = await JSZip.loadAsync(await fs.readFile(input))
    for (const [name, entry] of Object.entries(zip.files)) {
      const target = path.join(contentDir, name)
      if (entry.dir) {
        await fs.mkdir(target, { recursive: true })
        continue
      }
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, await entry.async('nodebuffer'))
    }
  } else if (/\.html?$/i.test(input)) {
    // A single-file export is the whole book already.
    await fs.copyFile(input, path.join(contentDir, 'index.html'))
  } else {
    throw new Error(`Unsupported input: ${input} (expected a .zip, a folder or an .html file)`)
  }

  if (!existsSync(path.join(contentDir, 'index.html'))) {
    throw new Error('No index.html found in the exported book')
  }
}

/** Book title, so the window and the executable carry the right name. */
async function readTitle(contentDir, fallback) {
  try {
    const source = await fs.readFile(path.join(contentDir, 'flipbook.json'), 'utf8')
    const title = JSON.parse(source).title
    if (title) return title
  } catch {
    // No source file: fall back to the <title> the exporter wrote.
  }
  try {
    const html = await fs.readFile(path.join(contentDir, 'index.html'), 'utf8')
    const match = html.match(/<title>([^<]*)<\/title>/i)
    if (match && match[1].trim()) return decodeEntities(match[1].trim())
  } catch {
    // Fall through to the caller's default.
  }
  return fallback
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** Electron rejects names with path separators or control characters. */
function safeName(title) {
  const cleaned = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 60) || 'Flipbook'
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.input) {
    console.error('Usage: node package.js <book.zip | folder | book.html> [--platform win32]')
    process.exit(1)
  }
  if (!existsSync(options.input)) {
    console.error(`Not found: ${options.input}`)
    process.exit(1)
  }

  const stagingDir = path.join(here, '.staging')
  const contentDir = path.join(stagingDir, 'content')

  console.log('Staging book…')
  await fs.rm(stagingDir, { recursive: true, force: true })
  await fs.mkdir(stagingDir, { recursive: true })
  await stageContent(path.resolve(options.input), contentDir)

  const title = options.name ?? (await readTitle(contentDir, 'Flipbook'))
  const appName = safeName(title)

  await fs.copyFile(path.join(here, 'main.js'), path.join(stagingDir, 'main.js'))
  await fs.writeFile(
    path.join(stagingDir, 'package.json'),
    JSON.stringify(
      {
        name: appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'flipbook',
        productName: appName,
        version: '1.0.0',
        main: 'main.js',
      },
      null,
      2,
    ),
  )

  console.log(`Packaging "${appName}" for ${options.platform}/${options.arch}…`)
  const args = [
    '@electron/packager',
    stagingDir,
    appName,
    `--platform=${options.platform}`,
    `--arch=${options.arch}`,
    `--out=${options.out}`,
    '--overwrite',
    // The staged app has no dependencies of its own, and pruning would send
    // the packager looking for a node_modules tree that is not there.
    '--prune=false',
  ]
  if (options.icon) args.push(`--icon=${options.icon}`)

  await run('npx', args)

  const suffix = options.platform === 'win32' ? '.exe' : options.platform === 'darwin' ? '.app' : ''
  console.log(
    `\nDone: ${path.join(options.out, `${appName}-${options.platform}-${options.arch}`, appName + suffix)}`,
  )
  if (options.platform === 'win32') {
    console.log('Ship the whole folder — the .exe needs the files beside it.')
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd: here })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    )
  })
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
