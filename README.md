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

`public/models/`, `public/data/` and `public/art/` are ignored on purpose. Put your own files
there. `public/art/<id>.webp` is the optional splash art behind a model, with a transparent
background. `public/art/faces/<id>.webp` is the optional square face picture in the character
list; without it the list shows the first letter of the name.

`public/data/profiles/<id>.json` is the optional profile below the model (introduction,
stories, voice lines, skills, resonance chain and keepsakes), and `public/art/skills/`,
`public/art/chain/` and `public/art/keepsakes/` hold the pictures it points to. The script
below writes them; the format is the `Profile` type in `src/lib/profiles.ts`. The
voice audio is not downloaded: the player streams it from encore.moe.

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

To download only the pictures and the profile, without the model and without Blender, add
`--no-model` before the ids. With `--profile` it only writes the profile and its pictures, and
keeps the splash art and the face picture that are there.

Some characters have more than one outfit. The script converts all of them, and the hall shows
a button for each. With `--skins` it only converts the alternate outfits of characters that
`characters.json` lists already.

Characters with animated gacha art in the API also get it in `public/art/l2d/<id>/`, and the
hall offers it next to the 3D model; the others show the splash art. With `--l2d` the script
only downloads that art. The hall plays it with the
[Spine Runtimes](http://esotericsoftware.com/spine-runtimes-license), whose license asks for
a Spine Editor license when you add them to your own software.

The arguments are character ids from `https://api-v2.encore.moe/api/en/character`. The script
downloads the model, the animations (poses, attacks and, where available, walking and
running) and the textures into `assets-raw/`, converts them with Blender, writes
`public/models/<id>.glb` and updates `public/data/characters.json`. It also writes the splash
art, the face picture, the skill icons and the profile described above.

It needs Node 22.15 or newer, Blender (on `PATH`, or set `BLENDER` to the executable) and the
[UEFormat](https://github.com/h4lfheart/UEFormat) Blender addon source in `tools/ueformat/src/`.
The character models come without weapons and props.

## Add weapons

```bash
node scripts/add-weapon.mjs --all
node scripts/add-weapon.mjs 21010015 21020015
```

The arguments are weapon ids from `https://api-v2.encore.moe/api/en/weapon`; `--all` takes
every weapon that `public/data/weapons.json` does not list yet. For each one the script writes
a still model to `public/models/weapons/<slug>.glb`, a copy in the size and place that it has
in a hand to `public/models/weapons/<slug>.held.glb` (the Resonator hall offers it to the
characters that use that type), a picture to
`public/art/weapons/<slug>.webp` and an entry to `public/data/weapons.json` (the `Weapon` type
in `src/lib/weapons.ts`). It needs the same tools as the character script. A weapon without a
3D model in the API is reported as failed. Effects of the game that have no main texture are
left out.

## Add stories

```bash
node scripts/add-story.mjs
node scripts/add-story.mjs --force
```

The script copies the story archive of `https://encore.moe/story` into the Library: the list to
`public/data/story.json`, the script of each story to `public/data/story/<id>.json` and the
pictures to `public/art/story/` (the `Story` types are in `src/lib/stories.ts`). Without
`--force` it only downloads what is missing. It does not need Blender. The scenes of the event
"Second Coming of Solaris" are not in the API response, so only its summary is shown.

## Deploy to shared hosting

Manual: run `npm run build`, then upload the **contents** of `dist/` (including `.htaccess`)
to the web folder, usually `public_html/`.

Automatic: add the repository secrets `FTP_SERVER`, `FTP_USERNAME` and `FTP_PASSWORD`.
Pushing to `main` then builds and uploads the site over FTPS. Upload `models/`, `data/` and
`art/` by hand, because they are not in Git.

If the site lives in a subfolder, change `base` in `vite.config.ts`, `RewriteBase` in
`public/.htaccess`, and `server-dir` in `.github/workflows/deploy.yml`.
