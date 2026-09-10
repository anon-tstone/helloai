# Getting the project onto a Windows machine

The repository is **public**, so nothing here needs a GitHub login. Pushing
changes back does.

Everything below assumes the target folder from the example is
`D:\progrma\TstoneSystems\Filpbook` — substitute your own.

## 1. Install Node.js

Download the **LTS** build from <https://nodejs.org> (version 20 or 22; CI uses
22). Then open **PowerShell** and confirm:

```powershell
node -v
npm -v
```

If `node` is not recognised, close and reopen PowerShell so it picks up the new
PATH.

## 2. Get the code

### Option A — clone (recommended)

Keeps the git history, so you can pull later updates and push your own changes.

```powershell
cd D:\progrma\TstoneSystems
git clone -b claude/flipbook-web-system-cclsu6 https://github.com/anon-tstone/helloai.git Filpbook
```

The project then lives at:

```
D:\progrma\TstoneSystems\Filpbook\flipbook\
```

The clone also carries an unrelated AR demo at its root — that is older work in
the same repository, not part of this project. Ignore it, or delete the root
`index.html`, `app.js` and `styles.css` if it bothers you.

To pull later changes:

```powershell
cd D:\progrma\TstoneSystems\Filpbook
git pull origin claude/flipbook-web-system-cclsu6
```

### Option B — download a ZIP (no git needed)

<https://github.com/anon-tstone/helloai/archive/refs/heads/claude/flipbook-web-system-cclsu6.zip>

Extract it, then copy the `flipbook` folder from inside to
`D:\progrma\TstoneSystems\Filpbook`. You lose the ability to pull updates.

Windows marks files from a downloaded ZIP as blocked. If Node complains,
right-click the ZIP **before** extracting → **Properties** → tick **Unblock**.

### Option C — files directly in the folder, no nesting

```powershell
cd D:\progrma\TstoneSystems
git clone -b claude/flipbook-web-system-cclsu6 https://github.com/anon-tstone/helloai.git _tmp
robocopy _tmp\flipbook Filpbook /E
Remove-Item _tmp -Recurse -Force
```

This gives you the project files with no `flipbook\` level, but no git history
either, so updates mean repeating the copy.

## 3. Install and run

```powershell
cd D:\progrma\TstoneSystems\Filpbook\flipbook
npm install
npm run db:local
npm run build
npx wrangler dev --local
```

Open <http://localhost:8787>. That is the whole app — editor, storage API and
reader — running locally with no Cloudflare account involved.

Stop it with **Ctrl+C**.

### While developing

Two PowerShell windows, so the front end reloads on save:

```powershell
# window 1 — the API on :8787
cd D:\progrma\TstoneSystems\Filpbook\flipbook
npm run dev:worker
```

```powershell
# window 2 — the editor on :5173, proxying /api to :8787
cd D:\progrma\TstoneSystems\Filpbook\flipbook
npm run dev
```

Open <http://localhost:5173>.

## 4. Deploy to Cloudflare

```powershell
cd D:\progrma\TstoneSystems\Filpbook\flipbook
npx wrangler login
npm run deploy
```

`wrangler login` opens a browser once. See [DEPLOY.md](DEPLOY.md) for the
resources this uses and the CI alternative.

## 5. Build a desktop .exe

```powershell
cd D:\progrma\TstoneSystems\Filpbook\flipbook\desktop
npm install
node package.js C:\Users\you\Downloads\my-book.zip --platform win32
```

Export the book from the app first (**Export offline → ZIP**). Details and
caveats in [../desktop/README.md](../desktop/README.md).

## If something goes wrong

| | |
| --- | --- |
| `node` / `npm` not recognised | Reopen PowerShell after installing Node |
| `npm install` very slow | Windows Defender scanning `node_modules`; excluding the project folder helps |
| `running scripts is disabled` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then reopen PowerShell |
| Port 8787 or 5173 in use | Close the other program, or `npx wrangler dev --local --port 8788` |
| `git` not recognised | Install Git for Windows from <https://git-scm.com>, or use Option B |
