(function crosswordShellFactory(global) {
  'use strict';

  const defaultLabels = Object.freeze({
    mute: 'Mute sound',
    unmute: 'Unmute sound',
    pause: 'Pause game',
    resume: 'Resume game',
    shuffle: 'Shuffle letters',
    hint: 'Watch a rewarded video for a clue',
    erase: 'Erase selected tile',
    board: 'Crossword board',
    rack: 'Letter tiles',
    cell: 'Crossword cell',
    tile: 'Letter tile',
    progress: 'Puzzle progress',
  });

  const icons = {
    volume: '<path d="M5 9v6h4l5 4V5L9 9H5Z"/><path d="M17 9.5a4 4 0 0 1 0 5"/><path d="M19.5 7a7.5 7.5 0 0 1 0 10"/>',
    muted: '<path d="M5 9v6h4l5 4V5L9 9H5Z"/><path d="m17 10 5 5m0-5-5 5"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    play: '<path d="m9 6 10 6-10 6Z"/>',
    shuffle: '<path d="M4 7h3c4.5 0 5.5 10 10 10h3"/><path d="m17 14 3 3-3 3"/><path d="M4 17h3c1.7 0 2.8-1.4 3.8-3"/><path d="M13.2 10C14.2 8.4 15.3 7 17 7h3"/><path d="m17 4 3 3-3 3"/>',
    bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M8.3 14.8A6 6 0 1 1 15.7 14.8C14.6 15.6 14 16.4 14 18h-4c0-1.6-.6-2.4-1.7-3.2Z"/>',
    erase: '<path d="m4 15 8-9 8 8-6 6H8l-4-5Z"/><path d="m9 10 7 7"/><path d="M13 20h8"/>',
  };

  function svgIcon(name) {
    return '<svg aria-hidden="true" viewBox="0 0 24 24">' + icons[name] + '</svg>';
  }

  function normalizeCell(value) {
    if (value === null || value === false || value === undefined) return null;
    if (typeof value === 'string') return { letter: value, fixed: true, target: false };
    return {
      letter: String(value.letter || ''),
      fixed: Boolean(value.fixed),
      target: Boolean(value.target),
    };
  }

  function glyphText(value) {
    return Array.from(String(value || '').trim()).slice(0, 2).join('');
  }

  function clampProgress(progress) {
    const total = Math.max(1, Math.min(9, Number(progress && progress.total) || 5));
    const current = Math.max(0, Math.min(total - 1, Number(progress && progress.current) || 0));
    return { current, total };
  }

  function mount(root, options) {
    if (!(root instanceof Element)) throw new TypeError('CrosswordShell.mount requires a DOM element.');

    const settings = options || {};
    const rows = Math.max(1, Number(settings.rows) || 7);
    const columns = Math.max(1, Number(settings.columns) || 8);
    const labels = Object.assign({}, defaultLabels, settings.labels || {});
    const onAction = typeof settings.onAction === 'function' ? settings.onAction : function noop() {};
    const state = {
      cells: Array.from({ length: rows * columns }, function (_, index) {
        return normalizeCell((settings.cells || [])[index]);
      }),
      rack: Array.from(settings.rack || [], function (letter) { return String(letter || ''); }),
      progress: clampProgress(settings.progress),
      selectedRackIndex: -1,
      selectedCellIndex: -1,
      muted: Boolean(settings.muted),
      paused: Boolean(settings.paused),
      hintBusy: false,
    };

    root.replaceChildren();
    root.classList.add('cw-shell');
    root.innerHTML = [
      '<div class="cw-app">',
        '<header class="cw-topbar">',
          '<div class="cw-progress" role="progressbar"></div>',
          '<div class="cw-top-actions">',
            '<button class="cw-action" type="button" data-action="mute"></button>',
            '<button class="cw-action" type="button" data-action="pause"></button>',
          '</div>',
        '</header>',
        '<main class="cw-stage">',
          '<div class="cw-board" role="grid"></div>',
          '<aside class="cw-dock">',
            '<div class="cw-rack" role="listbox"></div>',
            '<div class="cw-controls">',
              '<button class="cw-action" type="button" data-action="shuffle"></button>',
              '<button class="cw-action cw-action--hint" type="button" data-action="hint"></button>',
              '<button class="cw-action" type="button" data-action="erase"></button>',
            '</div>',
          '</aside>',
        '</main>',
      '</div>',
    ].join('');

    const board = root.querySelector('.cw-board');
    const rack = root.querySelector('.cw-rack');
    const progress = root.querySelector('.cw-progress');
    const muteButton = root.querySelector('[data-action="mute"]');
    const pauseButton = root.querySelector('[data-action="pause"]');
    const hintButton = root.querySelector('[data-action="hint"]');

    root.style.setProperty('--cw-columns', columns);
    root.style.setProperty('--cw-rows', rows);
    board.setAttribute('aria-label', labels.board);
    rack.setAttribute('aria-label', labels.rack);
    progress.setAttribute('aria-label', labels.progress);

    function emit(type, detail) {
      const payload = Object.assign({}, detail || {});
      root.dispatchEvent(new CustomEvent('crossword:' + type, { detail: payload, bubbles: true }));
      onAction(type, payload);
    }

    function actionButton(action, icon, label) {
      const button = root.querySelector('[data-action="' + action + '"]');
      button.innerHTML = svgIcon(icon);
      button.setAttribute('aria-label', label);
      return button;
    }

    actionButton('shuffle', 'shuffle', labels.shuffle);
    actionButton('erase', 'erase', labels.erase);
    hintButton.innerHTML = svgIcon('bulb') + '<span class="cw-play-badge">' + svgIcon('play') + '</span>';
    hintButton.setAttribute('aria-label', labels.hint);

    function renderTopActions() {
      muteButton.innerHTML = svgIcon(state.muted ? 'muted' : 'volume');
      muteButton.setAttribute('aria-label', state.muted ? labels.unmute : labels.mute);
      muteButton.setAttribute('aria-pressed', String(state.muted));

      pauseButton.innerHTML = svgIcon(state.paused ? 'play' : 'pause');
      pauseButton.setAttribute('aria-label', state.paused ? labels.resume : labels.pause);
      pauseButton.setAttribute('aria-pressed', String(state.paused));
    }

    function renderProgress() {
      progress.replaceChildren();
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', String(state.progress.total));
      progress.setAttribute('aria-valuenow', String(state.progress.current + 1));
      for (let index = 0; index < state.progress.total; index += 1) {
        const dot = document.createElement('span');
        dot.className = 'cw-progress-dot';
        if (index < state.progress.current) dot.classList.add('is-done');
        if (index === state.progress.current) dot.classList.add('is-current');
        progress.append(dot);
      }
    }

    function renderBoard() {
      board.replaceChildren();
      state.cells.forEach(function (cell, index) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cw-cell';
        button.dataset.index = String(index);
        button.setAttribute('role', 'gridcell');
        if (!cell) {
          button.classList.add('is-void');
          button.tabIndex = -1;
          button.disabled = true;
        } else {
          const letter = glyphText(cell.letter);
          button.textContent = letter;
          button.setAttribute('aria-label', letter ? labels.cell + ' ' + letter : labels.cell);
          if (!letter) button.classList.add('is-open');
          if (cell.fixed) button.classList.add('is-fixed');
          if (cell.target) button.classList.add('is-target');
          if (index === state.selectedCellIndex) button.classList.add('is-selected');
        }
        board.append(button);
      });
    }

    function renderRack() {
      rack.replaceChildren();
      root.style.setProperty('--cw-rack-count', Math.max(1, state.rack.length));
      state.rack.forEach(function (letter, index) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cw-rack-tile';
        button.dataset.index = String(index);
        button.setAttribute('role', 'option');
        button.setAttribute('aria-label', labels.tile + ' ' + letter);
        button.setAttribute('aria-selected', String(index === state.selectedRackIndex));
        button.textContent = glyphText(letter);
        if (index === state.selectedRackIndex) button.classList.add('is-selected');
        rack.append(button);
      });
    }

    function renderAll() {
      renderTopActions();
      renderProgress();
      renderBoard();
      renderRack();
      hintButton.disabled = state.hintBusy;
      hintButton.setAttribute('aria-busy', String(state.hintBusy));
    }

    function handleClick(event) {
      const cell = event.target.closest('.cw-cell:not(.is-void)');
      if (cell && root.contains(cell)) {
        state.selectedCellIndex = Number(cell.dataset.index);
        renderBoard();
        emit('cell', { index: state.selectedCellIndex, cell: state.cells[state.selectedCellIndex] });
        return;
      }

      const tile = event.target.closest('.cw-rack-tile');
      if (tile && root.contains(tile)) {
        state.selectedRackIndex = Number(tile.dataset.index);
        renderRack();
        emit('tile', { index: state.selectedRackIndex, letter: state.rack[state.selectedRackIndex] });
        return;
      }

      const action = event.target.closest('[data-action]');
      if (!action || !root.contains(action)) return;
      if (action.dataset.action === 'mute') {
        state.muted = !state.muted;
        renderTopActions();
        emit('mute', { muted: state.muted });
      } else if (action.dataset.action === 'pause') {
        state.paused = !state.paused;
        renderTopActions();
        emit('pause', { paused: state.paused });
      } else if (action.dataset.action === 'shuffle') {
        state.rack = state.rack.slice().sort(function () { return Math.random() - .5; });
        state.selectedRackIndex = -1;
        renderRack();
        emit('shuffle', { rack: state.rack.slice() });
      } else if (action.dataset.action === 'hint') {
        emit('hint', {});
      } else if (action.dataset.action === 'erase') {
        emit('erase', { cellIndex: state.selectedCellIndex });
      }
    }

    root.addEventListener('click', handleClick);
    renderAll();

    return Object.freeze({
      setBoard: function setBoard(cells) {
        state.cells = Array.from({ length: rows * columns }, function (_, index) {
          return normalizeCell((cells || [])[index]);
        });
        state.selectedCellIndex = -1;
        renderBoard();
      },
      setRack: function setRack(letters) {
        state.rack = Array.from(letters || [], function (letter) { return String(letter || ''); });
        state.selectedRackIndex = -1;
        renderRack();
      },
      setProgress: function setProgress(next) {
        state.progress = clampProgress(next);
        renderProgress();
      },
      setMuted: function setMuted(value) {
        state.muted = Boolean(value);
        renderTopActions();
      },
      setPaused: function setPaused(value) {
        state.paused = Boolean(value);
        renderTopActions();
      },
      setHintBusy: function setHintBusy(value) {
        state.hintBusy = Boolean(value);
        hintButton.disabled = state.hintBusy;
        hintButton.setAttribute('aria-busy', String(state.hintBusy));
      },
      destroy: function destroy() {
        root.removeEventListener('click', handleClick);
        root.replaceChildren();
        root.classList.remove('cw-shell');
      },
    });
  }

  function demoCells() {
    const map = [
      '..S.....',
      '..H..L..',
      'P.A.N.E.',
      '.CROSS..',
      '..E..R..',
      '..LATER.',
      '....D...',
    ];
    return map.join('').split('').map(function (letter, index) {
      if (letter === '.') return null;
      if (index === 27 || index === 28) return { letter: '', target: true };
      return { letter, fixed: index % 3 !== 0, target: index % 3 === 0 };
    });
  }

  function autoMount() {
    document.querySelectorAll('[data-crossword-shell][data-demo]').forEach(function (root) {
      mount(root, {
        rows: 7,
        columns: 8,
        cells: demoCells(),
        rack: ['A', 'E', 'L', 'N', 'R', 'S', 'T'],
        progress: { current: 2, total: 5 },
      });
    });
  }

  global.CrosswordShell = Object.freeze({ mount });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount, { once: true });
  else autoMount();
}(window));
