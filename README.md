# Responsive Crossword Shell

A reusable, dependency-free crossword UI for Playgama games and YouTube Playables. It keeps the visible interface textless: only board and rack letters are rendered. Controls use icons, while localized labels remain available to assistive technology.

## What the template owns

- Full-viewport portrait and landscape layout using `dvh`, safe-area insets, and height-bounded boards.
- An 8 x 7 board by default, configurable to any row and column count.
- Clock, crossword tabs, and a rewarded-clue button. The letter rack, mute, pause, shuffle, erase, and progress dots are intentionally not included.
- A small JavaScript API plus `crossword:*` events for game-engine integration.
- Keyboard focus, 44 px minimum controls, reduced-motion support, and no external assets.

The shell deliberately does **not** own puzzle rules, persistence, ads, localization files, or Playgama Bridge calls. Those remain in each game.

## Preview

Serve this folder and open `index.html`:

```bash
python3 -m http.server 8080 --directory .
```

## Use in a game

Copy `crossword-shell.css` and `crossword-shell.js` into the game, then add an empty mount element:

```html
<link rel="stylesheet" href="./crossword-shell.css">
<div data-crossword-shell></div>
<script src="./crossword-shell.js"></script>
```

Mount it after loading the game state:

```js
const shell = window.CrosswordShell.mount(
  document.querySelector('[data-crossword-shell]'),
  {
    rows: 7,
    columns: 8,
    cells,
    labels: localizedControlLabels,
    onAction(type, detail) {
      gameController.handleShellAction(type, detail);
    },
  },
);
```

Supported cell values:

```js
null                         // outside the crossword
{ letter: '', target: true } // open answer tile
{ letter: 'A', fixed: true } // supplied tile
{ letter: 'R' }              // placed tile
```

Methods returned by `mount`:

- `setBoard(cells)`
- `setHintBusy(boolean)`
- `destroy()`

Events are dispatched from the mount element and also passed to `onAction`:

- `crossword:cell`
- `crossword:hint`

## Clock, tabs, and ad breaks

- A clock is always shown top centre. It stops during ads and on the complete screen (`setTime(seconds)` to restore).
- Two rows of crossword tabs (`tabs: [{ id, label, done }]`, `activeTab`) emit `crossword:tab`.
- A preroll always runs before the board is shown, then `crossword:ready` fires.
- Hints always run a rewarded video. `crossword:hintreward` fires only on a confirmed reward; otherwise `crossword:hintfail`.
- Call `shell.complete()` when solved: a Next button appears, and pressing it runs an interstitial, then `crossword:next`.

Pass `ads: { preroll, rewarded, interstitial }` to `mount`; each returns a promise (`rewarded` must resolve `false` unless a reward was confirmed). Without it, textless placeholder ad breaks are used for previews.

## Rewarded clue contract

`crossword:hint` is only a request. The game must call its existing Playgama client wrapper, wait for a confirmed reward, update the puzzle state, then call `setBoard`. Never grant a clue on ad open, close, skip, or failure.

## Playgama contract

- Do not add direct Bridge calls to this template.
- Persist through the repository's canonical Playgama storage wrapper; do not use `localStorage`, `sessionStorage`, or IndexedDB.
- The game remains responsible for lifecycle pause/mute events, localization, first-playable `game_ready`, and ad placement policy.
- Run the normal game verifier and release commands after adopting the shell in a deployable game.

## Validation

Run the dependency-free template checks from the repository root:

```bash
node crossword-shell.test.mjs
```
