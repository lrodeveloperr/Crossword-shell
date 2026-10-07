(function crosswordShellFactory(global) {
  'use strict';

  const defaultLabels = Object.freeze({
    hint: 'Watch a rewarded video for a clue',
    next: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    board: 'Crossword board',
    rack: 'Letter tiles',
    cell: 'Crossword cell',
    tile: 'Letter tile',
    clock: 'Elapsed time',
    tabs: 'Crosswords',
    tab: 'Crossword',
    ad: 'Advertisement',
    complete: 'Crossword complete',
    next: 'Next level',
  });

  const icons = {
    play: '<path d="m9 6 10 6-10 6Z"/>',
    bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M8.3 14.8A6 6 0 1 1 15.7 14.8C14.6 15.6 14 16.4 14 18h-4c0-1.6-.6-2.4-1.7-3.2Z"/>',
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

  function normalizeTabs(tabs) {
    const list = Array.isArray(tabs) && tabs.length ? tabs : Array.from({ length: 10 }, function (_, i) { return i + 1; });
    return list.map(function (tab, index) {
      if (tab && typeof tab === 'object') {
        return { id: tab.id === undefined ? index : tab.id, label: String(tab.label === undefined ? index + 1 : tab.label), done: Boolean(tab.done) };
      }
      return { id: tab, label: String(tab), done: false };
    });
  }

  function formatClock(total) {
    const seconds = Math.max(0, Math.floor(total));
    const minutes = Math.floor(seconds / 60);
    return minutes + ':' + String(seconds % 60).padStart(2, '0');
  }

  // Stand-in ad breaks for previews. Games pass settings.ads with real Playgama-backed
  // functions; each returns a promise, and rewarded must resolve false unless a reward was confirmed.
  function placeholderAds() {
    function slot(kind, ms) {
      return function (context) {
        const overlay = context.overlay;
        overlay.className = 'cw-overlay cw-overlay--' + kind;
        overlay.innerHTML = '<div class="cw-card cw-card--ad" role="dialog" aria-modal="true" aria-label="' +
          context.labels.ad + '"><div class="cw-ad-bar"><span style="animation-duration:' + ms + 'ms"></span></div></div>';
        overlay.hidden = false;
        return new Promise(function (resolve) { global.setTimeout(function () { resolve(true); }, ms); });
      };
    }
    return { preroll: slot('preroll', 1600), rewarded: slot('rewarded', 2000), interstitial: slot('interstitial', 1600) };
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
      selectedRackIndex: -1,
      selectedCellIndex: -1,
      hintBusy: false,
      tabs: normalizeTabs(settings.tabs),
      activeTab: 0,
      seconds: Math.max(0, Number(settings.seconds) || 0),
      blocked: true,
      completed: false,
    };
    state.activeTab = Math.max(0, Math.min(state.tabs.length - 1, Number(settings.activeTab) || 0));
    const ads = Object.assign({}, placeholderAds(), settings.ads || {});
    let timer = 0;
    let destroyed = false;

    root.replaceChildren();
    root.classList.add('cw-shell');
    root.innerHTML = [
      '<div class="cw-app">',
        '<header class="cw-topbar">',
          '<div class="cw-clock" role="timer"></div>',
        '</header>',
        '<nav class="cw-tabs"></nav>',
        '<main class="cw-stage">',
          '<div class="cw-board-wrap"><div class="cw-board" role="grid"></div></div>',
          '<aside class="cw-dock">',
            '<div class="cw-rack" role="listbox"></div>',
            '<div class="cw-controls">',
              '<button class="cw-action cw-action--hint" type="button" data-action="hint"></button>',
            '</div>',
          '</aside>',
        '</main>',
        '<div class="cw-overlay" hidden></div>',
      '</div>',
    ].join('');

    const board = root.querySelector('.cw-board');
    const rack = root.querySelector('.cw-rack');
    const clock = root.querySelector('.cw-clock');
    const tabsNav = root.querySelector('.cw-tabs');
    const overlay = root.querySelector('.cw-overlay');
    const hintButton = root.querySelector('[data-action="hint"]');

    root.style.setProperty('--cw-columns', columns);
    root.classList.add('is-gated');
    root.style.setProperty('--cw-rows', rows);
    board.setAttribute('aria-label', labels.board);
    rack.setAttribute('aria-label', labels.rack);
    clock.setAttribute('aria-label', labels.clock);
    tabsNav.setAttribute('aria-label', labels.tabs);

    function emit(type, detail) {
      const payload = Object.assign({}, detail || {});
      root.dispatchEvent(new CustomEvent('crossword:' + type, { detail: payload, bubbles: true }));
      onAction(type, payload);
    }

    hintButton.innerHTML = svgIcon('bulb') + '<span class="cw-play-badge">' + svgIcon('play') + '</span>';
    hintButton.setAttribute('aria-label', labels.hint);

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

    function renderClock() {
      clock.textContent = formatClock(state.seconds);
    }

    function renderTabs() {
      tabsNav.replaceChildren();
      const perRow = Math.ceil(state.tabs.length / 2);
      tabsNav.style.setProperty('--cw-tab-cols', Math.max(1, perRow));
      state.tabs.forEach(function (tab, index) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cw-tab';
        button.dataset.tab = String(index);
        button.textContent = tab.label;
        button.setAttribute('aria-label', labels.tab + ' ' + tab.label);
        button.setAttribute('aria-pressed', String(index === state.activeTab));
        if (index === state.activeTab) button.classList.add('is-active');
        if (tab.done) button.classList.add('is-done');
        tabsNav.append(button);
      });
    }

    function tickRunning() {
      return !state.blocked && !state.completed;
    }

    function startClock() {
      if (timer || destroyed) return;
      timer = global.setInterval(function () {
        if (!tickRunning()) return;
        state.seconds += 1;
        renderClock();
      }, 1000);
    }

    function showOverlay(kind, content) {
      overlay.className = 'cw-overlay cw-overlay--' + kind;
      overlay.innerHTML = content;
      overlay.hidden = false;
    }

    function hideOverlay() {
      overlay.hidden = true;
      overlay.replaceChildren();
    }

    function runAd(kind) {
      state.blocked = true;
      return Promise.resolve()
        .then(function () { return ads[kind]({ overlay: overlay, root: root, labels: labels }); })
        .then(function (result) { return result !== false; }, function () { return false; });
    }

    function renderAll() {
      renderClock();
      renderTabs();
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

      const tab = event.target.closest('.cw-tab');
      if (tab && root.contains(tab)) {
        const index = Number(tab.dataset.tab);
        if (index === state.activeTab) return;
        state.activeTab = index;
        state.completed = false;
        state.seconds = 0;
        renderClock();
        renderTabs();
        emit('tab', { index: index, id: state.tabs[index].id });
        return;
      }

      const action = event.target.closest('[data-action]');
      if (!action || !root.contains(action)) return;
      if (action.dataset.action === 'next') {
        goNext(action);
      } else if (action.dataset.action === 'hint') {
        requestHint();
      }
    }

    function requestHint() {
      if (state.hintBusy || state.blocked) return;
      setHintBusy(true);
      emit('hint', {});
      runAd('rewarded').then(function (rewarded) {
        if (destroyed) return;
        state.blocked = state.completed;
        setHintBusy(false);
        if (rewarded) emit('hintreward', { cellIndex: state.selectedCellIndex });
        else emit('hintfail', {});
      });
    }

    function setHintBusy(value) {
      state.hintBusy = Boolean(value);
      hintButton.disabled = state.hintBusy;
      hintButton.setAttribute('aria-busy', String(state.hintBusy));
    }

    function complete() {
      if (state.completed) return;
      state.completed = true;
      state.blocked = true;
      emit('complete', { seconds: state.seconds, tab: state.activeTab });
      showOverlay('complete',
        '<div class="cw-card" role="dialog" aria-modal="true" aria-label="' + labels.complete + '">' +
          '<div class="cw-card-badge">' + svgIcon('check') + '</div>' +
          '<div class="cw-card-time">' + formatClock(state.seconds) + '</div>' +
          '<button class="cw-action cw-action--next" type="button" data-action="next" aria-label="' + labels.next + '">' +
            svgIcon('next') + '</button>' +
        '</div>');
      const next = overlay.querySelector('[data-action="next"]');
      if (next) next.focus();
    }

    function goNext(button) {
      if (button) button.disabled = true;
      hideOverlay();
      runAd('interstitial').then(function () {
        if (destroyed) return;
        hideOverlay();
        const last = state.activeTab >= state.tabs.length - 1;
        state.tabs[state.activeTab].done = true;
        if (!last) state.activeTab += 1;
        state.completed = false;
        state.blocked = false;
        state.seconds = 0;
        renderClock();
        renderTabs();
        emit('next', { index: state.activeTab, id: state.tabs[state.activeTab].id });
      });
    }

    root.addEventListener('click', handleClick);
    renderAll();
    startClock();
    runAd('preroll').then(function () {
      if (destroyed) return;
      hideOverlay();
      state.blocked = state.completed;
      root.classList.remove('is-gated');
      emit('ready', {});
    });

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
      setHintBusy: setHintBusy,
      setTabs: function setTabs(tabs, active) {
        state.tabs = normalizeTabs(tabs);
        state.activeTab = Math.max(0, Math.min(state.tabs.length - 1, Number(active) || 0));
        renderTabs();
      },
      setTime: function setTime(seconds) {
        state.seconds = Math.max(0, Number(seconds) || 0);
        renderClock();
      },
      complete: complete,
      destroy: function destroy() {
        destroyed = true;
        global.clearInterval(timer);
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
        onAction: function (type) { if (type === 'next') window.console.info('next level'); },
      });
    });
  }

  global.CrosswordShell = Object.freeze({ mount });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount, { once: true });
  else autoMount();
}(window));
