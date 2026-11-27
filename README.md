# Solaris Museum

A non-commercial fan project: a small 3D museum built with React, Vite and React Three Fiber.
Wuthering Waves and its assets belong to Kuro Games. This project is not affiliated with them.

The anime effects come from [Sakuga VFX](https://github.com/finktheartist/sakuga-vfx) by
Justin Finkelman (MIT, copied from commit `c3dabb1` into `public/sakuga-vfx/`).

## Run locally

```bash
npm install
npm run dev
```

## Assets (not in Git)

`public/models/` and `public/data/` are ignored on purpose. Put your own files there.

`public/data/characters.json`:

```json
[
  {
    "id": "example",
    "name": "Example",
    "element": "Aero",
    "weapon": "Sword",
    "rarity": 4,
    "model": "models/example.glb",
    "defaultAnimation": "Idle",
    "animationLabels": { "Idle": "Idle" }
  }
]
```

Models are GLB files with Meshopt compression. Draco is not supported by the viewer.

## Deploy to shared hosting

Manual: run `npm run build`, then upload the **contents** of `dist/` (including `.htaccess`)
to the web folder, usually `public_html/`.

Automatic: add the repository secrets `FTP_SERVER`, `FTP_USERNAME` and `FTP_PASSWORD`.
Pushing to `main` then builds and uploads the site over FTPS. Upload `models/` and `data/`
by hand, because they are not in Git.

If the site lives in a subfolder, change `base` in `vite.config.ts`, `RewriteBase` in
`public/.htaccess`, and `server-dir` in `.github/workflows/deploy.yml`.
