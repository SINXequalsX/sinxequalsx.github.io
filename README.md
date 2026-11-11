# Peter Jiang — academic website

This repository publishes [sinxequalsx.github.io](https://sinxequalsx.github.io) as a static GitHub Pages website.

## Edit locally

1. Open a terminal in this folder.
2. Run `npm run dev`.
3. Open the private editor URL printed in the terminal.
4. Add, edit, move, duplicate, or delete blocks.
5. Use **Save draft** to keep unpublished work only on this computer.
6. Use **Publish to GitHub** to build, commit, and push the finished version.

No database, public login, or online editor is used. The public site contains only static files.

## Galleries

Choose **+ → Gallery** to put multiple photos or drawings in one box. Select several images together, add optional captions, and use the arrows to arrange them. Choose **Grid** or **Stack vertically**; clicking an image opens the complete, uncropped photo with previous/next controls. Escape closes the viewer.

Each gallery supports up to 100 images (15 MB each). New gallery uploads stay in ignored local draft storage until you publish a gallery that uses them. **Save draft** keeps the gallery locally; **Publish to GitHub** publishes its images and layout.

## Build only

Run `npm run build`. The generated site is written to `dist/`.

## First-time GitHub Pages setting

In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**. Future pushes to `main` deploy automatically.
