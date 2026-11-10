# Astraeus hero: inner-scroller build

Patched copy of the designer's hero bundle (handoff 2026-11-04, config `2026-11-04-handoff`).
The original, unpatched files live in `VeljkoNikolic/hero-animation-astraeus` (`hero/`, commit `fb95143`).

## Why

On iPhone Safari the address bar collapses and expands while the page scrolls, which resizes the screen and makes the hero jump (QA AS-202).
If the page itself never scrolls, the bar stays still. This build lets the hero scroll an inner element instead of the page.

## What changed (astraeus-hero.js only)

`astraeus-hero.css` and `config.json` are identical to the handoff.

- Optional scroll container: an element with `data-ax="scroller"`. It is used only when it exists **and** is a scroll container
  (`overflow-y: auto` or `scroll`). Otherwise the bundle behaves exactly like the original.
- When active:
  - scroll position is read from, and written to, the scroller instead of `window` (snaps, "Scroll to explore", menu Home link, logo click);
  - the scroll listener is attached to the scroller;
  - the ScrollTrigger pin is replaced by a `div.ax-track` created around the root: the root is `position: sticky` inside it and the
    track's extra height is the scroll length. Sticky is composited with the scroll, so there is no pin jitter on touch screens;
  - the menu also locks the scroller while open;
  - the static fallback removes the track sizing.

## Page setup

Wrap `main` (and everything after it) in `<div data-ax="scroller">`. Header and menu stay outside. Then add:

```css
@media (hover: none) and (pointer: coarse) {
  html, body { height: 100%; overflow: hidden; }
  [data-ax="scroller"] { position: fixed; inset: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: none; }
}
```

The media query limits the inner scroller to touch devices; desktop keeps normal page scrolling.

## Updating for a new handoff

Re-apply the same edits to the new `astraeus-hero.js` (search for "Octo patch" and `SCR` in this file), or ask the designer to take
them into the bundle.
