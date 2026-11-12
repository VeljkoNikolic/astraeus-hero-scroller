# Astraeus hero: BlueYard-style mobile build

Patched copy of the designer's hero bundle, handoff **2026-11-11** (`config.json` `2026-11-11-handoff`, keyframes A to J).
The original, unpatched files live in `VeljkoNikolic/hero-animation-astraeus`, folder `hero/`.

## What it does

On touch devices nothing on the page can scroll natively, as on blueyard.com: the page is exactly one screen tall,
`html`, `body` and the scroll container are `overflow: hidden` with `touch-action: none`. The bundle moves the hero itself
from the finger, with iOS-like momentum. Safari and Chrome toolbars therefore never collapse or expand, and there is no
rubber-band bounce. Desktop is unchanged: normal page scrolling, exactly as the original bundle.

## Files

| File | Change |
|---|---|
| `astraeus-hero.js` | Patched (see below) |
| `astraeus-hero.css`, `config.json` | Identical to the 11 Nov handoff |
| `touch.css` | CSS for the page head (touch devices only) |

## Changes in astraeus-hero.js (search for "Octo patch")

- **Scroll container:** an element with `data-ax="scroller"` is used when the page CSS makes it `position: fixed`
  (the touch-only media query in `touch.css`). Otherwise the bundle behaves exactly as the original.
- **When active:**
  - every scroll read and write goes to the scroller instead of `window`: snaps, triggers, the J card glide and lock, "Scroll to explore", the menu Home link and the logo;
  - the ScrollTrigger pin is replaced by a `div.ax-track` around the root, with the root `position: sticky` inside it;
  - the menu also locks the scroller.
- **Virtual touch driver**, registered after the bundle's own touch listeners:
  - a swipe moves the scroller by the finger distance, and a flick carries on with momentum;
  - when the bundle claims a move (the J steps, the J card glide) or runs a glide (snaps, triggers), the driver leaves it alone, exactly as a held native scroll.
- **Static fallback** (reduced motion, no WebGL, slow device): the track sizing is removed, and `touch.css` makes the scroller natively scrollable again.

## Page setup (Webflow)

1. Wrap `main` in `<div data-ax="scroller">`. The header and menu stay outside.
2. Put `touch.css` in the page head inside a `<style>` tag, after the hero stylesheet.
3. Load this `astraeus-hero.js` and point `data-ax-config` at this `config.json`.

## New handoff from the designer

Re-apply the edits to the new `astraeus-hero.js`: the scroll reads and writes, the ScrollTrigger branch, the menu lock, the static fallback and the touch driver.
