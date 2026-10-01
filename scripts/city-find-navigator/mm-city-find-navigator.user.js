// ==UserScript==
// @name         MM City Find Navigator - Web + Mobile
// @namespace    https://www.torn.com/
// @version      0.5.0
// @description  Finds City-map items already loaded by Torn. Supports desktop web and TornPDA/mobile.
// @author       MM
// @match        https://www.torn.com/city.php*
// @match        https://*.torn.com/city.php*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/tuccijr75/MM-Torn-Public/main/scripts/city-find-navigator/mm-city-find-navigator.meta.js
// @downloadURL  https://raw.githubusercontent.com/tuccijr75/MM-Torn-Public/main/scripts/city-find-navigator/mm-city-find-navigator.user.js
// @license      Proprietary
// ==/UserScript==

(function () {
  'use strict';

  var APP_ID = 'mm-city-find-navigator';
  var CSS_ID = APP_ID + '-css';
  var STORE = 'mmCityFindNavigator.v5';
  var TARGET_ZOOM = 6;
  var REFRESH_MS = 2000;

  var state = {
    panel: null,
    list: null,
    count: null,
    status: null,
    collapseBtn: null,
    items: [],
    selectedKey: null,
    fingerprint: '',
    highlight: null,
    collapsed: false,
    poll: null
  };

  function isPDA() {
    try {
      if (typeof PDA_API !== 'undefined') return true;
    } catch (e) {}
    return /TornPDA/i.test(navigator.userAgent || '');
  }

  function isMobile() {
    if (isPDA()) return true;
    if ('ontouchstart' in window) return true;
    if (window.innerWidth <= 700) return true;
    try {
      return !!(
        window.matchMedia &&
        window.matchMedia('(pointer: coarse)').matches
      );
    } catch (e) {
      return false;
    }
  }

  var MOBILE = isMobile();
  var RUNTIME = isPDA() ? 'TornPDA' : (MOBILE ? 'Mobile Web' : 'Desktop Web');

  function tornReady() {
    try {
      return !!(
        window.torn &&
        window.L &&
        window.torn.map &&
        window.torn.map.lmap &&
        window.torn.model &&
        typeof window.torn.model.get === 'function' &&
        typeof window.torn.map.getLPoint === 'function' &&
        window.L.CRS &&
        window.L.CRS.EPSG3857
      );
    } catch (e) {
      return false;
    }
  }

  function activePage() {
    if (document.visibilityState && document.visibilityState !== 'visible') {
      return false;
    }
    if (MOBILE) return true;
    try {
      return !document.hasFocus || document.hasFocus();
    } catch (e) {
      return true;
    }
  }

  function storeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(STORE + '.' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function storeSet(key, value) {
    try {
      localStorage.setItem(STORE + '.' + key, JSON.stringify(value));
    } catch (e) {}
  }

  function setStatus(message, error) {
    if (!state.status) return;
    state.status.textContent = message;
    state.status.classList.toggle('mm-error', !!error);
  }

  function finiteNumber(value) {
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function objectValues(obj) {
    try {
      return Object.keys(obj).map(function (key) {
        return obj[key];
      });
    } catch (e) {
      return [];
    }
  }

  function decodeItems(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === 'object') return objectValues(value);
    if (typeof value !== 'string') return [];

    try {
      var parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return objectValues(parsed);
    } catch (e1) {}

    try {
      var decoded = JSON.parse(atob(value));
      if (Array.isArray(decoded)) return decoded;
      if (decoded && typeof decoded === 'object') return objectValues(decoded);
    } catch (e2) {}

    return [];
  }

  function getCoordinates(raw) {
    if (!raw || typeof raw !== 'object') return null;

    if (Array.isArray(raw.coordinates) && raw.coordinates.length >= 2) {
      var ax = finiteNumber(raw.coordinates[0]);
      var ay = finiteNumber(raw.coordinates[1]);
      if (ax !== null && ay !== null) return [ax, ay];
    }

    var source = raw.coordinates || raw.c;

    if (source && typeof source === 'object') {
      var sx = finiteNumber(source.x !== undefined ? source.x : source[0]);
      var sy = finiteNumber(source.y !== undefined ? source.y : source[1]);
      if (sx !== null && sy !== null) return [sx, sy];
    }

    var x = finiteNumber(raw.x !== undefined ? raw.x : raw.cx);
    var y = finiteNumber(raw.y !== undefined ? raw.y : raw.cy);

    return (x !== null && y !== null) ? [x, y] : null;
  }

  function parseItem(raw, index) {
    var coordinates = getCoordinates(raw);
    if (!coordinates) return null;

    var title = String(
      raw.title !== undefined ? raw.title :
      raw.name !== undefined ? raw.name :
      raw.itemName !== undefined ? raw.itemName :
      'City find ' + (index + 1)
    );

    var itemId =
      raw.itemId !== undefined ? raw.itemId :
      raw.item_id !== undefined ? raw.item_id :
      raw.d !== undefined ? raw.d : '';

    var rowId =
      raw.id !== undefined ? raw.id :
      raw.rowId !== undefined ? raw.rowId :
      raw.row_id !== undefined ? raw.row_id : '';

    return {
      raw: raw,
      title: title,
      coordinates: coordinates,
      key:
        String(rowId) + ':' +
        String(itemId) + ':' +
        coordinates[0] + ':' +
        coordinates[1] + ':' +
        title
    };
  }

  function getFinds() {
    if (!tornReady()) return [];

    try {
      return decodeItems(
        window.torn.model.get('territoryUserItems')
      )
        .map(parseItem)
        .filter(function (item) {
          return !!item;
        });
    } catch (e) {
      console.warn('[MM City Find Navigator] Could not read City finds:', e);
      return [];
    }
  }

  function toLatLng(item) {
    try {
      var point = [
        item.coordinates[0] / 2,
        item.coordinates[1] / 2
      ];

      var leafletPoint = window.torn.map.getLPoint(point);

      return window.L.CRS.EPSG3857.pointToLatLng(
        leafletPoint,
        window.torn.map.minZoom
      );
    } catch (e) {
      console.warn('[MM City Find Navigator] Coordinate conversion failed:', e);
      return null;
    }
  }

  function removeHighlight() {
    if (!state.highlight) return;

    try {
      if (tornReady()) {
        window.torn.map.lmap.removeLayer(state.highlight);
      }
    } catch (e) {}

    state.highlight = null;
  }

  function addHighlight(latlng) {
    removeHighlight();

    try {
      state.highlight = window.L.circleMarker(latlng, {
        radius: MOBILE ? 28 : 24,
        weight: 4,
        opacity: 1,
        fillOpacity: 0.1,
        interactive: false,
        className: 'mm-city-find-target'
      }).addTo(window.torn.map.lmap);
    } catch (e) {}
  }

  function currentIndex() {
    if (!state.items.length) return -1;

    for (var i = 0; i < state.items.length; i += 1) {
      if (state.items[i].key === state.selectedKey) return i;
    }

    return 0;
  }

  function locate(index) {
    if (!activePage()) {
      setStatus('Return to the active City page, then tap Locate.', true);
      return;
    }

    if (!tornReady()) {
      setStatus('City map is not ready yet.', true);
      return;
    }

    if (index < 0 || index >= state.items.length) return;

    var item = state.items[index];
    var latlng = toLatLng(item);

    if (!latlng) {
      setStatus('Could not calculate this item position.', true);
      return;
    }

    try {
      var map = window.torn.map.lmap;
      var zoom = TARGET_ZOOM;

      var min = typeof map.getMinZoom === 'function' ? map.getMinZoom() : null;
      var max = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : null;

      if (typeof min === 'number' && isFinite(min)) {
        zoom = Math.max(min, zoom);
      }

      if (typeof max === 'number' && isFinite(max)) {
        zoom = Math.min(max, zoom);
      }

      map.setView(latlng, zoom, { animate: false });

      state.selectedKey = item.key;
      addHighlight(latlng);
      render();

      setStatus(
        'Located: ' +
        item.title +
        '. Tap Torn\'s original marker to collect it.'
      );
    } catch (e) {
      console.error('[MM City Find Navigator] Locate failed:', e);
      setStatus('Map navigation failed.', true);
    }
  }

  function locateRelative(delta) {
    if (!state.items.length) return;

    var next =
      (currentIndex() + delta + state.items.length) %
      state.items.length;

    locate(next);
  }

  function render() {
    if (!state.list || !state.count) return;

    state.count.textContent = String(state.items.length);

    while (state.list.firstChild) {
      state.list.removeChild(state.list.firstChild);
    }

    if (!state.items.length) {
      var empty = document.createElement('div');
      empty.className = 'mm-empty';
      empty.textContent = 'No City finds are currently loaded.';
      state.list.appendChild(empty);

      state.selectedKey = null;
      removeHighlight();
      return;
    }

    var selectedExists = state.items.some(function (item) {
      return item.key === state.selectedKey;
    });

    if (!selectedExists) {
      state.selectedKey = state.items[0].key;
    }

    state.items.forEach(function (item, index) {
      var row = document.createElement('div');

      row.className =
        'mm-item-row' +
        (item.key === state.selectedKey ? ' mm-selected' : '');

      var info = document.createElement('div');
      info.className = 'mm-item-info';

      var name = document.createElement('div');
      name.className = 'mm-item-name';
      name.textContent = item.title;
      name.title = item.title;

      var pos = document.createElement('div');
      pos.className = 'mm-item-position';
      pos.textContent = (index + 1) + ' of ' + state.items.length;

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'mm-locate';
      button.textContent = 'Locate';

      button.addEventListener('click', function () {
        locate(index);
      });

      info.appendChild(name);
      info.appendChild(pos);

      row.appendChild(info);
      row.appendChild(button);

      state.list.appendChild(row);
    });
  }

  function refresh(force, manual) {
    if (!tornReady()) {
      setStatus('Panel loaded. Waiting for Torn City map…');
      return;
    }

    if (!activePage()) return;

    var items = getFinds();

    var fingerprint = items.map(function (item) {
      return item.key;
    }).join('|');

    if (!force && fingerprint === state.fingerprint) return;

    var oldSelected = state.selectedKey;

    state.items = items;
    state.fingerprint = fingerprint;

    var selectedExists = items.some(function (item) {
      return item.key === oldSelected;
    });

    if (!selectedExists) {
      state.selectedKey = items.length ? items[0].key : null;
    }

    render();

    if (manual) {
      setStatus(
        items.length
          ? (
            'Refreshed. ' +
            items.length +
            ' City find' +
            (items.length === 1 ? '' : 's') +
            ' loaded.'
          )
          : 'Refreshed. No City finds are currently loaded.'
      );
    } else if (!items.length) {
      setStatus('City map ready. No City finds currently loaded.');
    }
  }

  function setCollapsed(value) {
    state.collapsed = !!value;

    state.panel.classList.toggle(
      'mm-collapsed',
      state.collapsed
    );

    state.collapseBtn.textContent =
      state.collapsed ? '+' : '–';

    state.collapseBtn.setAttribute(
      'aria-label',
      state.collapsed ? 'Expand finder' : 'Collapse finder'
    );

    storeSet('collapsed', state.collapsed);
  }

  function restorePosition() {
    if (MOBILE || !state.panel) return;

    var position = storeGet('position', null);
    if (!position) return;

    var left = Number(position.left);
    var top = Number(position.top);

    if (!isFinite(left) || !isFinite(top)) return;

    var maxLeft = Math.max(
      8,
      window.innerWidth - state.panel.offsetWidth - 8
    );

    var maxTop = Math.max(
      8,
      window.innerHeight - 48
    );

    state.panel.style.left =
      Math.min(maxLeft, Math.max(8, left)) + 'px';

    state.panel.style.top =
      Math.min(maxTop, Math.max(8, top)) + 'px';

    state.panel.style.right = 'auto';
    state.panel.style.bottom = 'auto';
  }

  function enableDrag(handle) {
    if (MOBILE) return;

    var dragging = false;
    var pointerId = null;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;

    handle.addEventListener('pointerdown', function (event) {
      if (
        (event.button !== undefined && event.button !== 0) ||
        event.target.closest('button')
      ) {
        return;
      }

      dragging = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = state.panel.offsetLeft;
      startTop = state.panel.offsetTop;

      try {
        handle.setPointerCapture(pointerId);
      } catch (e) {}
    });

    handle.addEventListener('pointermove', function (event) {
      if (!dragging || event.pointerId !== pointerId) return;

      var maxLeft = Math.max(
        8,
        window.innerWidth - state.panel.offsetWidth - 8
      );

      var maxTop = Math.max(
        8,
        window.innerHeight - 48
      );

      var left = Math.min(
        maxLeft,
        Math.max(
          8,
          startLeft + event.clientX - startX
        )
      );

      var top = Math.min(
        maxTop,
        Math.max(
          8,
          startTop + event.clientY - startY
        )
      );

      state.panel.style.left = left + 'px';
      state.panel.style.top = top + 'px';
      state.panel.style.right = 'auto';
      state.panel.style.bottom = 'auto';
    });

    function stop(event) {
      if (!dragging || event.pointerId !== pointerId) return;

      dragging = false;

      try {
        handle.releasePointerCapture(pointerId);
      } catch (e) {}

      pointerId = null;

      storeSet('position', {
        left: state.panel.offsetLeft,
        top: state.panel.offsetTop
      });
    }

    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;

    var style = document.createElement('style');
    style.id = CSS_ID;

    style.textContent = [
      '#' + APP_ID + '{position:fixed;top:170px;right:18px;z-index:2147483000;width:min(330px,calc(100vw - 24px));max-width:100%;overflow:hidden;background:#202226;color:#f3f4f6;border:1px solid #3a3d43;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.38);font:13px/1.35 Arial,sans-serif;}',
      '#' + APP_ID + ',#' + APP_ID + ' *{box-sizing:border-box;}',
      '#' + APP_ID + ' .mm-header{display:flex;align-items:center;gap:8px;min-height:44px;padding:7px 8px 7px 10px;background:#2b2e33;border-bottom:1px solid #3a3d43;user-select:none;-webkit-user-select:none;}',
      '#' + APP_ID + ':not(.mm-mobile) .mm-header{cursor:move;touch-action:none;}',
      '#' + APP_ID + ' .mm-title-wrap{flex:1;min-width:0;}',
      '#' + APP_ID + ' .mm-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;}',
      '#' + APP_ID + ' .mm-runtime{margin-top:1px;color:#bfc3ca;font-size:10px;}',
      '#' + APP_ID + ' .mm-count{display:inline-flex;align-items:center;justify-content:center;min-width:25px;height:25px;padding:0 7px;border-radius:999px;background:#43474e;font-weight:700;}',
      '#' + APP_ID + ' button{min-height:34px;border:1px solid #555a63;border-radius:6px;background:#383c43;color:#f5f5f5;padding:6px 10px;cursor:pointer;font:inherit;line-height:1.2;}',
      '#' + APP_ID + ' .mm-collapse{min-width:36px;font-size:17px;}',
      '#' + APP_ID + ' .mm-body{padding:9px;}',
      '#' + APP_ID + '.mm-collapsed .mm-body{display:none;}',
      '#' + APP_ID + ' .mm-toolbar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px;}',
      '#' + APP_ID + ' .mm-list{max-height:250px;overflow-y:auto;border:1px solid #363941;border-radius:6px;background:#191b1f;}',
      '#' + APP_ID + ' .mm-item-row{display:flex;align-items:center;gap:8px;padding:7px;border-bottom:1px solid #30333a;}',
      '#' + APP_ID + ' .mm-item-row.mm-selected{background:rgba(255,255,255,.09);}',
      '#' + APP_ID + ' .mm-item-info{flex:1;min-width:0;}',
      '#' + APP_ID + ' .mm-item-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}',
      '#' + APP_ID + ' .mm-item-position{margin-top:2px;color:#bfc3ca;font-size:10px;}',
      '#' + APP_ID + ' .mm-empty{padding:15px 10px;color:#c3c6cc;text-align:center;}',
      '#' + APP_ID + ' .mm-status{margin-top:8px;color:#bfc3ca;font-size:11px;}',
      '#' + APP_ID + ' .mm-status.mm-error{color:#ffb4b4;}',
      '.mm-city-find-target{stroke:#fff;fill:#fff;pointer-events:none;}',
      '#' + APP_ID + '.mm-mobile{top:auto;right:6px;bottom:6px;left:6px;width:auto;max-width:none;border-radius:10px;}',
      '#' + APP_ID + '.mm-mobile .mm-header{min-height:48px;cursor:default;touch-action:manipulation;}',
      '#' + APP_ID + '.mm-mobile button{min-width:44px;min-height:44px;padding:8px 10px;font-size:14px;}',
      '#' + APP_ID + '.mm-mobile .mm-list{max-height:245px;}',
      '#' + APP_ID + '.mm-mobile .mm-item-row{min-height:54px;padding:7px 8px;}'
    ].join('');

    (document.head || document.documentElement).appendChild(style);
  }

  function makeButton(textValue) {
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = textValue;
    return button;
  }

  function buildUi() {
    if (!document.body || document.getElementById(APP_ID)) {
      return false;
    }

    injectCss();

    var panel = document.createElement('section');
    panel.id = APP_ID;
    panel.setAttribute('aria-label', 'City Find Navigator');

    if (MOBILE) {
      panel.className = 'mm-mobile';
    }

    var header = document.createElement('div');
    header.className = 'mm-header';

    var titleWrap = document.createElement('div');
    titleWrap.className = 'mm-title-wrap';

    var title = document.createElement('div');
    title.className = 'mm-title';
    title.textContent = 'City Find Navigator';

    var runtime = document.createElement('div');
    runtime.className = 'mm-runtime';
    runtime.textContent = RUNTIME + ' • v0.5 RC';

    var count = document.createElement('span');
    count.className = 'mm-count';
    count.textContent = '0';

    var collapseBtn = makeButton('–');
    collapseBtn.className = 'mm-collapse';

    titleWrap.appendChild(title);
    titleWrap.appendChild(runtime);

    header.appendChild(titleWrap);
    header.appendChild(count);
    header.appendChild(collapseBtn);

    var body = document.createElement('div');
    body.className = 'mm-body';

    var toolbar = document.createElement('div');
    toolbar.className = 'mm-toolbar';

    var previous = makeButton('Previous');
    var next = makeButton('Next');
    var refreshBtn = makeButton('Refresh');

    previous.addEventListener('click', function () {
      locateRelative(-1);
    });

    next.addEventListener('click', function () {
      locateRelative(1);
    });

    refreshBtn.addEventListener('click', function () {
      refresh(true, true);
    });

    toolbar.appendChild(previous);
    toolbar.appendChild(next);
    toolbar.appendChild(refreshBtn);

    var list = document.createElement('div');
    list.className = 'mm-list';

    var statusEl = document.createElement('div');
    statusEl.className = 'mm-status';
    statusEl.setAttribute('aria-live', 'polite');

    body.appendChild(toolbar);
    body.appendChild(list);
    body.appendChild(statusEl);

    panel.appendChild(header);
    panel.appendChild(body);

    document.body.appendChild(panel);

    state.panel = panel;
    state.list = list;
    state.count = count;
    state.status = statusEl;
    state.collapseBtn = collapseBtn;

    state.collapsed = !!storeGet('collapsed', false);

    collapseBtn.addEventListener('click', function () {
      setCollapsed(!state.collapsed);
    });

    setCollapsed(state.collapsed);
    restorePosition();
    enableDrag(header);

    setStatus(
      'Panel loaded on ' +
      RUNTIME +
      '. Waiting for Torn City map…'
    );

    return true;
  }

  function beginMapWatcher() {
    var attempts = 0;

    var waiter = setInterval(function () {
      attempts += 1;

      if (tornReady()) {
        clearInterval(waiter);

        refresh(true, false);

        state.poll = setInterval(function () {
          if (activePage()) {
            refresh(false, false);
          }
        }, REFRESH_MS);

        return;
      }

      if (attempts % 20 === 0) {
        setStatus(
          'Panel loaded. Still waiting for Torn City map…'
        );
      }

      if (attempts >= 300) {
        clearInterval(waiter);

        setStatus(
          'Panel loaded, but Torn City map objects were not detected.',
          true
        );
      }
    }, 100);
  }

  function boot() {
    var attempts = 0;

    var bodyWaiter = setInterval(function () {
      attempts += 1;

      if (buildUi()) {
        clearInterval(bodyWaiter);
        beginMapWatcher();
      } else if (
        document.getElementById(APP_ID) ||
        attempts >= 200
      ) {
        clearInterval(bodyWaiter);
      }
    }, 50);
  }

  window.addEventListener('focus', function () {
    if (
      state.panel &&
      tornReady() &&
      activePage()
    ) {
      refresh(true, false);
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (
      state.panel &&
      tornReady() &&
      activePage()
    ) {
      refresh(true, false);
    }
  });

  window.addEventListener('resize', function () {
    if (!MOBILE && state.panel) {
      restorePosition();
    }
  });

  window.addEventListener('beforeunload', function () {
    removeHighlight();

    if (state.poll) {
      clearInterval(state.poll);
    }
  });

  boot();
})();
