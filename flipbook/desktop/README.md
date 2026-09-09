# Desktop app (.exe / .app / Linux binary)

Wraps an **exported** flipbook in an Electron window so it ships as a
double-click application, with no browser and no internet.

The web editor cannot produce a native binary on its own — a browser has no way
to link an executable — so this is a one-command step you run after exporting.

## Use it

```bash
cd flipbook/desktop
npm install                       # once; pulls Electron (~270 MB)

# Export the book from the app first (Export offline → ZIP), then:
node package.js ~/Downloads/my-book.zip --platform win32
```

The input can be any of the exporter's outputs:

| Input | |
| --- | --- |
| `my-book.zip` | the ZIP export |
| `my-book/` | that ZIP already unpacked |
| `my-book.html` | the single-file export |

### Options

| Flag | Default | |
| --- | --- | --- |
| `--platform` | this machine | `win32`, `darwin`, `linux` |
| `--arch` | this machine | `x64`, `arm64` |
| `--name` | the book's title | window title and file name |
| `--icon` | Electron's | `.ico` (Windows), `.icns` (macOS), `.png` |
| `--out` | `./dist-desktop` | output directory |

You can build a Windows `.exe` from macOS or Linux — that is tested. Embedding a
**custom Windows icon** is the one step that additionally needs `wine` on those
hosts; without it the app simply carries the default Electron icon. Building on
Windows itself has no such caveat.

## What you get

```
dist-desktop/My Book-win32-x64/
├── My Book.exe          ← double-click this
├── resources/app/content/   ← the exported book
└── … Electron runtime
```

**Ship the whole folder.** The `.exe` loads the files beside it; on its own it
will not run. Zip the folder to hand it over, or wrap it with an installer such
as Inno Setup or NSIS if you want a single-file download.

Expect roughly 200–300 MB: that is the Chromium runtime Electron bundles, and
it is the price of a self-contained desktop app. The plain ZIP or single-file
HTML export stays in the kilobytes if size matters more than a desktop icon.

## Inside the app

- Links in the book open in the system browser, never inside the app window
- **Ctrl/Cmd + P** prints, or saves the whole book as a PDF
- **F11** toggles fullscreen, **Ctrl/Cmd + +/−** zooms
- The renderer runs sandboxed with Node disabled — the book is static HTML and
  needs neither
