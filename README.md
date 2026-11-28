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

## Add the gallery

```bash
node scripts/add-gallery.mjs
node scripts/add-gallery.mjs --force
```

The script copies the namecards, the titles and the achievements into the Gallery: the list,
with the name and the description of every achievement, to `public/data/gallery.json` (the
`Gallery` type is in `src/lib/gallery.ts`) and the pictures to `public/art/gallery/`. Without
`--force` it only downloads the pictures that are missing. It does not need Blender.

## Add the glossary

```bash
node scripts/add-glossary.mjs
```

The script copies the term explanations of the game to `public/data/glossary.json` (the `Term`
type is in `src/lib/glossary.ts`). It does not need Blender. The page `/glossary`, linked from
the Library, lists every term. In the stories, the character profiles and keepsakes, the area
reports and the Bestiary, the first mention of a term in a block of text gets a tooltip;
`isStoryTerm` in `src/lib/glossary.ts` leaves out the combat terms and the names that the texts
mostly use as ordinary words. The tooltip stands next to its word in browsers with CSS
anchor positioning, and in the middle of the screen in the others.

## Add the phone chats

```bash
node scripts/add-chat.mjs
node scripts/add-chat.mjs --force
```

The script copies the phone chats of the game to the page `/messages`, linked from the
Library: the list to `public/data/chat.json`, the messages of each conversation to
`public/data/chat/<id>.json` (the types are in `src/lib/chats.ts`) and the avatars, stickers
and photos to `public/art/chat/`. Without `--force` it only downloads the pictures that are
missing. It does not need Blender. Conversations without any message are left out. A few
messages have only their text key in the API; the page shows them as not available.

## Add the documents

```bash
node scripts/add-document.mjs
node scripts/add-document.mjs --force
```

The script copies the documents, notes, photos and recordings that can be found in the game to
the page `/documents`, linked from the Library: the list, with the full texts, to
`public/data/documents.json` (the types are in `src/lib/documents.ts`) and the pictures to
`public/art/documents/`. Without `--force` it only downloads the pictures that are missing. It
does not need Blender. Entries that the game has not filled in are left out. Most documents do
not record where they can be found, and the sound of the recordings is not copied.

## The exhibition hall

The Gallery room shows each collection on a curved wall inside a round colonnade. The hall is
an original low-poly model that is in Git, in `src/assets/gallery/hall.glb`. To change it,
edit `scripts/build-gallery.py` and run it:

```bash
blender --background --factory-startup --python scripts/build-gallery.py
```

It also runs inside an open Blender, where it only makes its own `Solaris_Gallery` scene. The
frames of the pieces are painted in the browser, by `src/three/pieceArt.ts`.

## Add the map

```bash
node scripts/add-map.mjs
node scripts/add-map.mjs --force
```

The script copies the regions, their areas and the two exploration reports of every area into
the Map room: the list, with the full text of the reports, to `public/data/map.json` (the
`WorldMap` type is in `src/lib/map.ts`) and the pictures to `public/art/map/`. Without
`--force` it only downloads the pictures that are missing. It does not need Blender. The API
has a description for some regions only.

## The floating map

The Map room shows the regions as floating islands, one per region, with a beacon for every
area. The islands are original low-poly models, so unlike the other models they are in Git, in
`src/assets/map/islands.glb`, and the build uploads them with the page. To change them, edit
`scripts/build-map.py` and run it:

```bash
blender --background --factory-startup --python scripts/build-map.py
```

It also runs inside an open Blender, where it only makes its own `Solaris_Map` scene. An area
stands on a pin of its island, in the order of `map.json`. A new region needs an island in the
script and an entry in `ISLANDS` in `src/three/WorldScene.tsx`; until then it is only in the
strip under the map.

## Add monsters

```bash
node scripts/add-monster.mjs --bosses
node scripts/add-monster.mjs 340000010 330000110
node scripts/add-monster.mjs --all
```

The arguments are monster ids from `https://api-v2.encore.moe/api/en/monster`; `--bosses` takes
the Overlord and the Calamity Class, and `--all` takes every monster. The script writes the list
of the Bestiary to `public/data/bestiary.json` (the `Monster` type is in
`src/lib/bestiary.ts`), the head pictures to `public/art/bestiary/` and the models to
`public/models/monsters/`, each with an idle clip and, where the API has them, an appearance,
walking, running, up to four attacks and a fall. It needs the same tools as the character
script. Monsters that share a model get one file, which a later run does not convert again
(`--force` does). A monster without a 3D model in the API is listed with its picture only. A
weapon or another part that has a skeleton of its own is left out; the script names it.

## The arena

The Bestiary room shows one monster at a time on a dais among standing stones. The arena is an
original low-poly model that is in Git, in `src/assets/bestiary/arena.glb`. To change it, edit
`scripts/build-bestiary.py` and run it:

```bash
blender --background --factory-startup --python scripts/build-bestiary.py
```

It also runs inside an open Blender, where it only makes its own `Solaris_Bestiary` scene.

## The Wilds: walking in the Bestiary

The view of the Bestiary without walking is "Arena". Walking, the room is not a corridor but an
open map: a camp that floats in the sky, and around it one island for every element, each with a
landmark of its own (a windmill tree, a crown of ice, a storm spire, a torn gate, a volcano, a
temple of light and the skull of a giant). Bridges lead from the camp to every island and from
each island to the next one. Every monster has a den on the island of its element, with the
strongest in the middle; it turns to watch a visitor who is close, and greets one. The buttons
of the elements jump to an island, and the way back to the lobby is the portal at the camp. Only
the nearest monsters are loaded, and the others show as a gem in the color of their rank. A
monster without a 3D model shows its head picture as a medal.

The map is original low-poly work that is in Git, in `src/assets/bestiary/wilds.glb`, with its
layout (what can be walked on, what is in the way and what turns) in `wilds.json` beside it. To
change it, edit `scripts/build-wilds.py`, which writes both files, and run it:

```bash
blender --background --factory-startup --python scripts/build-wilds.py
```

It also runs inside an open Blender, where it only makes its own `Solaris_Wilds` scene. Where the
dens are is in `src/lib/wilds.ts`; the scene is drawn by `src/three/WildsScene.tsx`.

## Add the echoes

```bash
node scripts/add-echo.mjs
node scripts/add-echo.mjs --force
```

The script writes the echoes and the Sonata sets of the Echo room to
`public/data/echo.json` (the `EchoArchive` type is in `src/lib/echoes.ts`) and the pictures
to `public/art/echo/`. Without `--force` it only downloads the pictures that are missing. It
does not need Blender. The API has no 3D model of an echo (its mesh is a placeholder object),
so run it after `add-monster.mjs`: each echo borrows the model of a Bestiary monster. The
`MonsterId` of an echo is its own id, not the id of a monster, so the script matches by name
(a Phantom may take the name without "Phantom: "), else by the folder of the idle clip, else
by the name without "Nightmare: " or "Reminiscence: ", else by the echo of
`ParentMonsterId`. Echoes that find no monster show their picture. The room itself is drawn
in the browser, by `src/three/ChamberScene.tsx`.

## The lobby

The lobby is a corridor that the visitor walks along, with the door of a room at the left or
the right of every bay. The corridor is an original low-poly model that is in Git, in
`src/assets/lobby/corridor.glb`. The page repeats its bay once per room, so a new room only
needs an entry in `src/lib/rooms.ts`; where the doors stand is in `src/lib/corridor.ts`. To
change the model, edit `scripts/build-lobby.py` and run it:

```bash
blender --background --factory-startup --python scripts/build-lobby.py
```

It also runs inside an open Blender, where it only makes its own `Solaris_Lobby` scene.

There are three ways to look around, chosen in the top bar. "Tour" walks from door to door.
"First person" and "Third person" walk freely: WASD or the arrows, Shift to run, a drag to
look around, and a thumb stick on touch screens. A walker enters a room by walking into its
portal or with the key E. In the third-person view the visitor picks the Resonator who walks;
those without a `Walk` clip are listed in `src/lib/roam.ts`, so add a new one there if it
has none. The walking and the collisions are in `src/lib/roam.ts` and `src/three/Roamer.tsx`.
Some Resonators have their upper body, hair or tail in a model file of their own; the import
script joins them. `node scripts/add-character.mjs --models <id>` converts a Resonator again.

A Resonator stands by every door and says hello when the visitor comes near. Who it is and
what they say is set per room in `src/lib/rooms.ts`; the words are our own, not lines of the
game. The guards use light models with only two clips, in `public/models/guards/`, and only
those within two doors are shown. The walk through the Resonator Hall uses the same light
models, one for every Resonator. After adding or converting a Resonator, make them again and
upload them:

```bash
node scripts/build-guards.mjs
npm run upload
```

## Walking in the Armory, the Resonator Hall and the Library

These rooms have the same three ways to look around. The one without walking is "List" in the
Armory, with one weapon on the stage, "Stage" in the Resonator Hall and "Ring" in the Library.
When walking, every kind of weapon and every element has its own wing, with a stand at both
sides of every bay. The Library is one aisle between bookcases, with one book for every story:
the book that the visitor looks at comes out of the shelf and shows its cover. The categories
follow each other, each one under a board with its name, and their buttons jump to them. The
key E opens the report of the weapon,
the dossier of the Resonator or the script of the story. Only what is close by is loaded. The
walk through the Library starts at the story that was read last. The aisle is laid out in
`src/lib/shelves.ts` and drawn by `src/three/ShelfScene.tsx`. The address ending `?stage` shows a Resonator on the stage also to a
visitor who walks. The shared layout is in `src/lib/wings.ts`, the scene in
`src/three/WingScene.tsx` and the page around it in `src/components/WingWalk.tsx`. All walks
use `src/three/Roamer.tsx`, which takes the floor of a room: its portals, what is in the way,
and where it ends, or for ground of another shape, which points can be stood on.

## The search box

One search box covers the Resonators, weapons, monsters, echoes, stories and documents. The
search button of every room opens it, as do Ctrl+K and `/`. It reads the lists in
`public/data/` when it is first opened, so there is no index to build. Of the stories it
searches the names and summaries, not the scripts in `public/data/story/`. The code is in
`src/lib/search.ts` and `src/components/GlobalSearch.tsx`.

## The memory of a visit

The museum remembers, in the `localStorage` of the browser: the favorites (Resonators,
weapons, monsters, echoes, stories and documents), the stories and documents that are marked
as read, and the page where each story was left. The lists show a sign on these entries, the
Library opens at the story that was read last, the lobby offers to continue it, and the search
box can show the favorites only. Nothing is sent to a server, and another browser or device
starts empty. The code is in `src/lib/visits.ts`.

## The sound of the rooms

Every room has its own quiet music, air and small sounds. Web Audio makes them while they
play, so there are no audio files to upload. A browser only allows sound after the visitor has
pressed something, so it starts with the first click or key. The button beside the search
button turns it off, and the browser remembers that. The sound gets quieter while a voice line
plays and stops while the tab is hidden. The rooms are described in `src/lib/soundscapes.ts`
and played by `src/lib/ambience.ts`.

## Deploy to shared hosting

Manual: run `npm run build`, then upload the **contents** of `dist/` (including `.htaccess`)
to the web folder, usually `public_html/`.

Automatic: add the repository secrets `FTP_SERVER`, `FTP_USERNAME` and `FTP_PASSWORD`.
Pushing to `main` then builds and uploads the site over FTPS. `models/`, `data/` and `art/`
are not in Git, so upload them from your computer with the script below.

### Upload the assets

Put the same three values in `.env.local`, which Git ignores:

```
FTP_SERVER=ftp.example.com
FTP_USERNAME=name
FTP_PASSWORD=secret
```

```bash
npm run upload -- --check
npm run upload -- --dry-run
npm run upload
```

`--check` only looks for files that the data names but that are not in `public/`, and needs
no server. `--dry-run` lists what would be uploaded. Without an option the script uploads the
new and changed files, the lists in `data/` last, and then checks that every file is on the
server with the right size. It never deletes a file on the server. Run it again after a lost
connection to continue.

`FTP_DIR` is the web folder (default `public_html`; use `./` if the account starts there) and
`FTP_PORT` is only needed for an unusual port. The script remembers the uploaded files in
`work/upload-assets.json`. A file that it has no record of, and that has the right size on the
server, counts as uploaded, except for the data files, which it sends again.

### Link previews

The host needs PHP (7.4 or newer). `public/share.php` answers every page address with
`index.html` plus the title and the Open Graph tags of that page, so a shared link shows a
preview in Discord and elsewhere. It reads `data/` and `art/` on the server. `npm run dev` and
`npm run preview` do not run it; there only the tab titles change. A new room needs its name in
`ROOMS` in that file.

If the site lives in a subfolder, change `base` in `vite.config.ts`, `RewriteBase` in
`public/.htaccess`, and `server-dir` in `.github/workflows/deploy.yml`.
