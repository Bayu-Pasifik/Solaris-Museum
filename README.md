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

## Add a character

```bash
node scripts/add-character.mjs 1202 1103
```

The arguments are character ids from `https://api-v2.encore.moe/api/en/character`. The script
downloads the model, three idle animations and the textures into `assets-raw/`, converts them
with Blender, writes `public/models/<id>.glb` and updates `public/data/characters.json`.

It needs Node 22.15 or newer, Blender (on `PATH`, or set `BLENDER` to the executable) and the
[UEFormat](https://github.com/h4lfheart/UEFormat) Blender addon source in `tools/ueformat/src/`.
Weapons and props are not included.

## Deploy to shared hosting

Manual: run `npm run build`, then upload the **contents** of `dist/` (including `.htaccess`)
to the web folder, usually `public_html/`.

Automatic: add the repository secrets `FTP_SERVER`, `FTP_USERNAME` and `FTP_PASSWORD`.
Pushing to `main` then builds and uploads the site over FTPS. Upload `models/` and `data/`
by hand, because they are not in Git.

If the site lives in a subfolder, change `base` in `vite.config.ts`, `RewriteBase` in
`public/.htaccess`, and `server-dir` in `.github/workflows/deploy.yml`.
