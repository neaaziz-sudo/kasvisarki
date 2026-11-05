'use strict';

(function () {
  // Sama avain on index.html:n teemaskriptissä. Avaimen pitää olla yksilöllinen, koska
  // käyttäjän kaikki GitHub Pages -projektit jakavat saman localStoragen.
  const STORAGE_KEY = 'vegesaurus-arkiruokia-v1';
  const APP_ID = 'vegesauruksen-arkiruokia';
  const SCHEMA = 1;
  const MAX_NAME = 120, MAX_THEME = 60, MAX_URL = 2000, MAX_IMPORT_BYTES = 2 * 1024 * 1024;

  const DAYS = window.VEGE_DEFAULTS.map((day) => ({
    id: day.id, name: day.name, short: day.short, theme: day.theme,
    meals: day.meals.map((meal, i) => {
      const m = typeof meal === 'string' ? { name: meal, url: '' } : meal;
      return { id: `${day.id}-${String(i + 1).padStart(2, '0')}`, name: m.name, url: m.url || '' };
    }),
  }));
  const DAY_BY_ID = Object.fromEntries(DAYS.map((d) => [d.id, d]));
  const DEFAULT_BY_ID = Object.fromEntries(DAYS.flatMap((d) => d.meals.map((m) => [m.id, m])));

  const PALETTES = [
    { id: 'herne', name: 'Herne', colors: ['#F5F8EF', '#4F7A28'] },
    { id: 'punajuuri', name: 'Punajuuri', colors: ['#FBF4F6', '#9B2C4B'] },
    { id: 'porkkana', name: 'Porkkana', colors: ['#FFF7F0', '#C2571A'] },
    { id: 'kaali', name: 'Kaali', colors: ['#F5F3FA', '#5E3F8C'] },
    { id: 'grafiitti', name: 'Grafiitti', colors: ['#1E2226', '#A8D98A'] },
  ];
  const MODES = [
    { id: 'system', name: 'Järjestelmän mukaan' },
    { id: 'light', name: 'Vaalea' },
    { id: 'dark', name: 'Tumma' },
  ];

  /* ---------- Tila ja tallennus ---------- */

  function emptyState() {
    return {
      schema: SCHEMA,
      selected: {},  // { ruoan id: true }
      deleted: {},   // poistetut oletusruoat { ruoan id: true }
      edits: {},     // oletusruokien muutokset { ruoan id: { name?, url?, vegan? } }
      custom: Object.fromEntries(DAYS.map((d) => [d.id, []])), // omat ruoat päivittäin
      themes: {},    // muokatut teemojen nimet { päivän id: nimi }
      palette: 'herne',
      mode: 'system',
      veganOnly: false,
      logoPaused: null, // null = käyttäjä ei ole valinnut, seurataan vähennetyn liikkeen asetusta
    };
  }

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // Palauttaa kelvollisen http(s)-osoitteen, tyhjän merkkijonon tai null, jos osoite ei kelpaa.
  function normalizeUrl(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return '';
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
    try {
      const url = new URL(withScheme);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (!url.hostname.includes('.')) return null;
      return url.href.length <= MAX_URL ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  // Sama siivous koskee sekä localStoragea että tuotua tiedostoa: tuntematon tieto jää pois,
  // ja reseptilinkeiksi kelpaavat vain http(s)-osoitteet.
  function sanitizeState(raw) {
    const state = emptyState();
    if (!isObject(raw)) return state;

    const custom = {};
    const seen = new Set();
    for (const day of DAYS) {
      const list = isObject(raw.custom) && Array.isArray(raw.custom[day.id]) ? raw.custom[day.id] : [];
      custom[day.id] = [];
      for (const item of list) {
        if (!isObject(item)) continue;
        const name = cleanText(item.name, MAX_NAME);
        const id = typeof item.id === 'string' && /^c-[\w-]{1,40}$/.test(item.id) ? item.id : null;
        if (!name || !id || seen.has(id)) continue;
        seen.add(id);
        custom[day.id].push({ id, name, url: normalizeUrl(item.url) || '', vegan: item.vegan === true });
      }
    }
    state.custom = custom;

    if (isObject(raw.selected)) {
      for (const id of Object.keys(raw.selected)) {
        if (raw.selected[id] === true && (DEFAULT_BY_ID[id] || seen.has(id))) state.selected[id] = true;
      }
    }
    if (isObject(raw.deleted)) {
      for (const id of Object.keys(raw.deleted)) {
        if (raw.deleted[id] === true && DEFAULT_BY_ID[id]) {
          state.deleted[id] = true;
          delete state.selected[id];
        }
      }
    }
    if (isObject(raw.edits)) {
      for (const id of Object.keys(raw.edits)) {
        const edit = raw.edits[id];
        if (!DEFAULT_BY_ID[id] || !isObject(edit)) continue;
        const clean = {};
        const name = cleanText(edit.name, MAX_NAME);
        if (name) clean.name = name;
        if (typeof edit.url === 'string') clean.url = normalizeUrl(edit.url) || '';
        if (edit.vegan === true) clean.vegan = true;
        if (Object.keys(clean).length) state.edits[id] = clean;
      }
    }
    if (isObject(raw.themes)) {
      for (const day of DAYS) {
        const theme = cleanText(raw.themes[day.id], MAX_THEME);
        if (theme) state.themes[day.id] = theme;
      }
    }
    if (PALETTES.some((p) => p.id === raw.palette)) state.palette = raw.palette;
    if (MODES.some((m) => m.id === raw.mode)) state.mode = raw.mode;
    state.veganOnly = raw.veganOnly === true;
    if (typeof raw.logoPaused === 'boolean') state.logoPaused = raw.logoPaused;
    return state;
  }

  function loadState() {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      return text ? sanitizeState(JSON.parse(text)) : emptyState();
    } catch (e) {
      return emptyState();
    }
  }

  function save() {
    hideToast();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageWarning.hidden = true;
    } catch (e) {
      storageWarning.hidden = false;
    }
  }

  const themeOf = (day) => state.themes[day.id] || day.theme;

  function mealsOf(dayId) {
    const defaults = DAY_BY_ID[dayId].meals
      .filter((m) => !state.deleted[m.id])
      .map((m) => {
        const edit = state.edits[m.id] || {};
        return {
          id: m.id,
          name: edit.name || m.name,
          url: edit.url !== undefined ? edit.url : m.url,
          vegan: edit.vegan === true,
          isDefault: true,
        };
      });
    return defaults.concat(state.custom[dayId].map((m) => ({ ...m, isDefault: false })));
  }

  const selectedOf = (dayId) => mealsOf(dayId).filter((m) => state.selected[m.id]);

  /* ---------- Apufunktiot ---------- */

  // Kaikki käyttäjän teksti kulkee textContentin kautta, joten sitä ei koskaan tulkita HTML:ksi.
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'class') el.className = value;
      else if (key === 'checked' || key === 'value' || key === 'htmlFor') el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child.nodeType ? child : String(child));
    }
    return el;
  }

  function svgIcon(pathData) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.append(path);
    return svg;
  }
  const PENCIL = 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3zM14 8l3 3';

  function recipeLink(meal, className) {
    return h('a', {
      class: className, href: meal.url, target: '_blank', rel: 'noopener noreferrer',
      'aria-label': `Resepti: ${meal.name} (avautuu uuteen välilehteen)`,
    }, 'Resepti ↗');
  }

  const newCustomId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function focusLater(selector) {
    const el = selector && view.querySelector(selector);
    if (el) el.focus();
  }

  const byId = (prefix, id) => `[data-${prefix}="${id}"]`;

  /* ---------- Ilmoitus ---------- */

  let toastTimer = null;

  function hideToast() {
    clearTimeout(toastTimer);
    toast.hidden = true;
    toast.replaceChildren();
  }

  function showToast(message, action) {
    clearTimeout(toastTimer);
    toast.replaceChildren(h('span', null, message));
    if (action) {
      toast.append(h('button', { type: 'button', onclick: action.run }, action.label));
    }
    toast.hidden = false;
    toastTimer = setTimeout(hideToast, action ? 7000 : 3000);
  }

  /* ---------- Väriteema ---------- */

  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  // Grafiitti on tumma oletusteema: järjestelmän mukaan -tilassa se pysyy tummana,
  // ja sen vaalea versio saadaan valitsemalla Vaalea.
  function resolveMode() {
    if (state.mode === 'light' || state.mode === 'dark') return state.mode;
    if (state.palette === 'grafiitti') return 'dark';
    return darkQuery && darkQuery.matches ? 'dark' : 'light';
  }

  function applyTheme() {
    const root = document.documentElement;
    root.setAttribute('data-palette', state.palette);
    root.setAttribute('data-mode', resolveMode());
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
  }

  /* ---------- Logon animaatio ---------- */

  function isLogoPaused() {
    if (state.logoPaused !== null) return state.logoPaused;
    return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function applyLogoMotion() {
    const paused = isLogoPaused();
    logoBtn.classList.toggle('is-paused', paused);
    logoBtn.setAttribute('aria-label', paused ? 'Käynnistä logon animaatio' : 'Pysäytä logon animaatio');
  }

  /* ---------- Välilehdet ---------- */

  const TAB_IDS = DAYS.map((d) => d.id).concat('viikko');
  const todayId = () => DAYS[(new Date().getDay() + 6) % 7].id; // getDay: 0 = sunnuntai

  function buildTabs() {
    const today = todayId();
    for (const id of TAB_IDS) {
      const day = DAY_BY_ID[id];
      const tab = h('button', {
        type: 'button', role: 'tab', id: `tab-${id}`, 'aria-controls': 'view',
        class: `tab${day ? '' : ' tab-week'}${id === today ? ' is-today' : ''}`,
        onclick: () => navigate(id, true),
      }, h('span', null, day ? day.short : 'Viikko'), h('span', { class: 'tab-count' }, '0'));
      tabs.append(tab);
    }
    tabs.addEventListener('keydown', (event) => {
      const index = TAB_IDS.indexOf(event.target.id.replace('tab-', ''));
      if (index < 0) return;
      let next = null;
      if (event.key === 'ArrowRight') next = (index + 1) % TAB_IDS.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + TAB_IDS.length) % TAB_IDS.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = TAB_IDS.length - 1;
      if (next === null) return;
      event.preventDefault();
      navigate(TAB_IDS[next], true);
      document.getElementById(`tab-${TAB_IDS[next]}`).focus();
    });
  }

  function updateTabs() {
    let total = 0;
    for (const day of DAYS) {
      const count = selectedOf(day.id).length;
      total += count;
      setTab(day.id, `${day.name}${day.id === todayId() ? ', tänään' : ''}, ${count} valittu`, count);
    }
    setTab('viikko', `Viikko, yhteensä ${total} valittu`, total);
    const anyTab = TAB_IDS.includes(current) ? current : todayId();
    for (const id of TAB_IDS) {
      const tab = document.getElementById(`tab-${id}`);
      tab.setAttribute('aria-selected', String(id === current));
      tab.tabIndex = id === anyTab ? 0 : -1;
    }
    if (TAB_IDS.includes(current)) {
      view.setAttribute('role', 'tabpanel');
      view.setAttribute('aria-labelledby', `tab-${current}`);
      settingsBtn.removeAttribute('aria-current');
    } else {
      view.removeAttribute('role');
      view.removeAttribute('aria-labelledby');
      settingsBtn.setAttribute('aria-current', 'page');
    }
  }

  function setTab(id, label, count) {
    const tab = document.getElementById(`tab-${id}`);
    tab.setAttribute('aria-label', label);
    tab.dataset.count = count;
    tab.querySelector('.tab-count').textContent = count;
  }

  /* ---------- Reititys ---------- */

  const VIEWS = TAB_IDS.concat('asetukset');
  let current = todayId();
  let editingId = null;
  let confirmNewWeek = false;
  let resetStep = 0;
  let pendingImport = null;
  let importError = '';

  function resetTransient() {
    editingId = null;
    confirmNewWeek = false;
    resetStep = 0;
    pendingImport = null;
    importError = '';
  }

  // Välilehtien vaihto korvaa historiarivin ja asetukset lisää uuden, joten
  // puhelimen takaisin-painike vie asetuksista takaisin päivään eikä selaa päiviä.
  function navigate(id, replace) {
    if (id === current && location.hash.slice(1) === id) return;
    if (replace) {
      history.replaceState(null, '', `#${id}`);
      show(id);
    } else {
      location.hash = id;
    }
  }

  function show(id) {
    current = VIEWS.includes(id) ? id : todayId();
    resetTransient();
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- Piirto ---------- */

  function render(focusSelector) {
    if (current === 'viikko') renderWeek();
    else if (current === 'asetukset') renderSettings();
    else renderDay(current);
    updateTabs();
    focusLater(focusSelector);
  }

  /* ---------- Päivänäkymä ---------- */

  function renderDay(dayId) {
    const day = DAY_BY_ID[dayId];
    const meals = mealsOf(dayId);
    const visible = state.veganOnly ? meals.filter((m) => m.vegan) : meals;
    const deletedCount = day.meals.filter((m) => state.deleted[m.id]).length;

    const list = visible.length
      ? h('ul', { class: 'meal-list', 'aria-label': `${day.name}n ruoat` }, visible.map((m) => mealRow(m, dayId)))
      : h('p', { class: 'meal-list empty' }, state.veganOnly
        ? 'Tällä päivällä ei ole vegaaniseksi merkittyjä ruokia. Poista suodatin ja merkitse ruoka vegaaniseksi kynäpainikkeella.'
        : 'Lista on tyhjä. Lisää oma ruoka tai palauta poistetut.');

    view.replaceChildren(
      h('div', { class: 'day-head' },
        h('h2', null, day.name),
        h('p', { class: 'day-theme' }, themeOf(day))),
      h('div', { class: 'day-tools' },
        h('label', { class: 'check-line' },
          h('input', {
            type: 'checkbox', class: 'checkbox', id: 'vegan-filter', checked: state.veganOnly,
            onchange: (event) => {
              state.veganOnly = event.target.checked;
              save();
              render('#vegan-filter');
            },
          }),
          'Näytä vain vegaaniset'),
        h('p', { class: 'day-count', id: 'day-count' }, `${selectedOf(dayId).length} valittu`)),
      list,
      addForm(dayId),
      deletedCount
        ? h('div', { class: 'restore' }, h('button', {
          type: 'button', class: 'btn', id: 'restore-btn', onclick: () => restoreDeleted(dayId),
        }, `Palauta poistetut (${deletedCount})`))
        : null,
    );
  }

  function mealRow(meal, dayId) {
    if (meal.id === editingId) return h('li', { class: 'meal' }, editForm(meal, dayId));
    const selected = !!state.selected[meal.id];
    const li = h('li', { class: `meal${selected ? ' is-selected' : ''}` });
    const hasMeta = meal.url || meal.vegan;
    li.append(h('div', { class: 'meal-main' },
      h('label', { class: 'meal-check' },
        h('input', {
          type: 'checkbox', class: 'checkbox', checked: selected, 'data-check': meal.id,
          onchange: (event) => {
            if (event.target.checked) state.selected[meal.id] = true;
            else delete state.selected[meal.id];
            save();
            li.classList.toggle('is-selected', event.target.checked);
            view.querySelector('#day-count').textContent = `${selectedOf(dayId).length} valittu`;
            updateTabs();
          },
        }),
        h('span', { class: 'meal-name' }, meal.name)),
      h('button', {
        type: 'button', class: 'icon-btn row-btn', 'aria-label': `Muokkaa: ${meal.name}`, 'data-edit': meal.id,
        onclick: () => {
          editingId = meal.id;
          render(byId('edit-name', meal.id));
        },
      }, svgIcon(PENCIL)),
      h('button', {
        type: 'button', class: 'icon-btn row-btn remove-x', 'aria-label': `Poista: ${meal.name}`, 'data-remove': meal.id,
        onclick: () => removeMeal(meal, dayId),
      }, h('span', { 'aria-hidden': 'true' }, '×')),
      hasMeta ? h('div', { class: 'meal-meta' },
        meal.vegan ? h('span', { class: 'tag' }, 'Vegaani') : null,
        meal.url ? recipeLink(meal, 'recipe-link') : null) : null,
    ));
    return li;
  }

  function editForm(meal, dayId) {
    const nameError = h('p', { class: 'error', id: `err-name-${meal.id}`, hidden: true }, 'Anna ruoalle nimi.');
    const urlError = h('p', { class: 'error', id: `err-url-${meal.id}`, hidden: true },
      'Osoite ei kelpaa. Kirjoita se muodossa https://esimerkki.fi/resepti.');
    const nameInput = h('input', {
      class: 'input', id: `name-${meal.id}`, type: 'text', value: meal.name, maxlength: MAX_NAME,
      autocomplete: 'off', 'data-edit-name': meal.id,
    });
    const urlInput = h('input', {
      class: 'input', id: `url-${meal.id}`, type: 'url', inputmode: 'url', value: meal.url,
      maxlength: MAX_URL, autocomplete: 'off', placeholder: 'https://', 'data-edit-url': meal.id,
    });
    const veganInput = h('input', { type: 'checkbox', class: 'checkbox', checked: meal.vegan, 'data-edit-vegan': meal.id });

    const cancel = () => {
      editingId = null;
      render(byId('edit', meal.id));
    };

    return h('form', {
      class: 'edit-form', novalidate: true,
      'aria-label': `Muokkaa ruokaa ${meal.name}`,
      onkeydown: (event) => {
        if (event.key === 'Escape') cancel();
      },
      onsubmit: (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        const url = normalizeUrl(urlInput.value);
        setError(nameInput, nameError, !name);
        setError(urlInput, urlError, url === null);
        if (!name) { nameInput.focus(); return; }
        if (url === null) { urlInput.focus(); return; }
        updateMeal(meal, dayId, { name, url, vegan: veganInput.checked });
        editingId = null;
        save();
        // Jos Vegaani-merkintä poistui suodatin päällä, rivi katoaa eikä kynäpainiketta ole.
        render('#vegan-filter');
        focusLater(byId('edit', meal.id));
      },
    },
    h('div', { class: 'field' },
      h('label', { htmlFor: `name-${meal.id}` }, 'Ruoan nimi'), nameInput, nameError),
    h('div', { class: 'field' },
      h('label', { htmlFor: `url-${meal.id}` }, 'Reseptilinkki (valinnainen)'), urlInput, urlError),
    h('label', { class: 'check-line' }, veganInput, 'Vegaaninen'),
    h('div', { class: 'btn-row' },
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Tallenna'),
      h('button', { type: 'button', class: 'btn', onclick: cancel }, 'Peruuta')));
  }

  function setError(input, errorEl, isError) {
    errorEl.hidden = !isError;
    if (isError) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', errorEl.id);
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  }

  function updateMeal(meal, dayId, values) {
    if (meal.isDefault) {
      const original = DEFAULT_BY_ID[meal.id];
      const edit = {};
      if (values.name !== original.name) edit.name = values.name;
      if (values.url !== original.url) edit.url = values.url;
      if (values.vegan) edit.vegan = true;
      if (Object.keys(edit).length) state.edits[meal.id] = edit;
      else delete state.edits[meal.id];
    } else {
      const target = state.custom[dayId].find((m) => m.id === meal.id);
      if (target) Object.assign(target, values);
    }
  }

  function addForm(dayId) {
    const input = h('input', {
      class: 'input', id: 'add-input', type: 'text', maxlength: MAX_NAME, autocomplete: 'off',
      placeholder: 'Esim. mummon kasviskeitto',
    });
    const error = h('p', { class: 'error', id: 'add-error', hidden: true }, 'Kirjoita ensin ruoan nimi.');
    return h('form', {
      class: 'add-form', novalidate: true,
      onsubmit: (event) => {
        event.preventDefault();
        const name = input.value.trim();
        setError(input, error, !name);
        if (!name) { input.focus(); return; }
        state.custom[dayId].push({ id: newCustomId(), name, url: '', vegan: false });
        save();
        render('#add-input');
        if (state.veganOnly) showToast('Lisätty. Ruoka näkyy, kun poistat suodattimen.');
        else showToast(`Lisätty: ${name}`);
      },
    },
    h('label', { class: 'field-label', htmlFor: 'add-input' }, 'Lisää oma ruoka'),
    h('div', { class: 'add-row' },
      input,
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Lisää')),
    error);
  }

  function removeMeal(meal, dayId) {
    const snapshot = JSON.stringify(state);
    const rows = [...view.querySelectorAll('[data-remove]')].map((b) => b.dataset.remove);
    const nextId = rows[rows.indexOf(meal.id) + 1] || rows[rows.indexOf(meal.id) - 1];

    delete state.selected[meal.id];
    if (meal.isDefault) state.deleted[meal.id] = true;
    else state.custom[dayId] = state.custom[dayId].filter((m) => m.id !== meal.id);
    save();
    render(nextId ? byId('remove', nextId) : '#add-input');
    showToast(`Poistettu: ${meal.name}`, {
      label: 'Kumoa',
      run: () => {
        state = sanitizeState(JSON.parse(snapshot));
        save();
        render(byId('remove', meal.id));
        showToast('Poisto kumottu.');
      },
    });
  }

  function restoreDeleted(dayId) {
    let count = 0;
    for (const meal of DAY_BY_ID[dayId].meals) {
      if (state.deleted[meal.id]) {
        delete state.deleted[meal.id];
        count += 1;
      }
    }
    save();
    render('#add-input');
    showToast(count === 1 ? 'Palautettiin 1 ruoka.' : `Palautettiin ${count} ruokaa.`);
  }

  /* ---------- Viikkonäkymä ---------- */

  function renderWeek() {
    const total = DAYS.reduce((sum, day) => sum + selectedOf(day.id).length, 0);
    view.replaceChildren(
      h('h2', null, 'Viikon ruoat'),
      h('p', { class: 'day-count' }, total ? `Yhteensä ${total} valittu` : 'Et ole vielä valinnut ruokia.'),
      h('div', { class: 'week-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', id: 'copy-btn', onclick: copyList }, 'Kopioi lista'),
        h('button', {
          type: 'button', class: 'btn', id: 'new-week-btn',
          onclick: () => {
            confirmNewWeek = true;
            render('#new-week-confirm');
          },
        }, 'Aloita uusi viikko'),
        confirmNewWeek ? h('div', { class: 'confirm', role: 'group', 'aria-label': 'Vahvista uuden viikon aloitus' },
          h('p', null, 'Tyhjennetäänkö kaikki valinnat? Omat ruoat ja reseptilinkit säilyvät.'),
          h('div', { class: 'btn-row' },
            h('button', {
              type: 'button', class: 'btn btn-primary', id: 'new-week-confirm',
              onclick: () => {
                state.selected = {};
                confirmNewWeek = false;
                save();
                render('#new-week-btn');
                showToast('Valinnat tyhjennetty. Uusi viikko alkaa!');
              },
            }, 'Kyllä, tyhjennä valinnat'),
            h('button', {
              type: 'button', class: 'btn',
              onclick: () => {
                confirmNewWeek = false;
                render('#new-week-btn');
              },
            }, 'Peruuta'))) : null),
      h('div', { class: 'week-grid' }, DAYS.map(dayCard)),
    );
  }

  function dayCard(day) {
    const meals = selectedOf(day.id);
    return h('section', { class: 'day-card', 'aria-label': day.name },
      h('div', { class: 'day-card-head' },
        h('h3', null, day.name),
        h('span', { class: 'day-card-theme' }, themeOf(day))),
      meals.length
        ? h('ul', null, meals.map((meal) => h('li', null,
          h('span', null, meal.name),
          meal.vegan ? h('span', { class: 'tag' }, 'Vegaani') : null,
          meal.url ? recipeLink(meal, 'recipe-link') : null)))
        : h('p', { class: 'day-card-empty' }, 'Ei valittuja ruokia.'));
  }

  function weekText() {
    return DAYS
      .map((day) => ({ day, meals: selectedOf(day.id) }))
      .filter((entry) => entry.meals.length)
      .map(({ day, meals }) => [
        `${day.name} – ${themeOf(day)}`,
        ...meals.map((m) => `- ${m.name}${m.vegan ? ' (vegaani)' : ''}${m.url ? ` ${m.url}` : ''}`),
      ].join('\n'))
      .join('\n\n');
  }

  async function copyList() {
    const text = weekText();
    if (!text) {
      showToast('Valitse ensin ruokia.');
      return;
    }
    if (await writeClipboard(text)) showToast('Lista kopioitu leikepöydälle.');
    else showToast('Kopiointi ei onnistunut tässä selaimessa.');
  }

  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const area = h('textarea', { 'aria-hidden': 'true', class: 'visually-hidden', readonly: true });
      area.value = text;
      document.body.append(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      area.remove();
      document.getElementById('copy-btn')?.focus();
      return ok;
    }
  }

  /* ---------- Asetukset ---------- */

  function renderSettings() {
    view.replaceChildren(
      h('div', { class: 'settings' },
        h('h2', { tabindex: '-1', id: 'settings-title' }, 'Asetukset'),
        appearancePanel(),
        themesPanel(),
        backupPanel(),
        resetPanel(),
        howtoPanel()),
    );
  }

  function appearancePanel() {
    return h('section', { class: 'panel', 'aria-labelledby': 'look-title' },
      h('h3', { id: 'look-title' }, 'Ulkoasu'),
      h('fieldset', null,
        h('legend', null, 'Väriteema'),
        PALETTES.map((palette) => h('label', { class: 'radio-line' },
          h('input', {
            type: 'radio', name: 'palette', value: palette.id, checked: state.palette === palette.id,
            onchange: () => {
              state.palette = palette.id;
              save();
              applyTheme();
            },
          }),
          palette.name,
          h('span', { class: 'swatches', 'aria-hidden': 'true' },
            palette.colors.map((color) => h('span', { class: 'swatch', style: `background:${color}` })))))),
      h('fieldset', null,
        h('legend', null, 'Tila'),
        MODES.map((mode) => h('label', { class: 'radio-line' },
          h('input', {
            type: 'radio', name: 'mode', value: mode.id, checked: state.mode === mode.id,
            onchange: () => {
              state.mode = mode.id;
              save();
              applyTheme();
            },
          }),
          mode.name))),
      h('p', null, 'Grafiitti pysyy tummana myös järjestelmän mukaan -tilassa. Sen vaalean version saat valitsemalla Vaalea.'));
  }

  function themesPanel() {
    return h('section', { class: 'panel', 'aria-labelledby': 'themes-title' },
      h('h3', { id: 'themes-title' }, 'Päivien teemat'),
      h('p', null, 'Tyhjä kenttä palauttaa alkuperäisen teeman.'),
      DAYS.map((day) => h('div', { class: 'field' },
        h('label', { htmlFor: `theme-${day.id}` }, day.name),
        h('input', {
          class: 'input', id: `theme-${day.id}`, type: 'text', maxlength: MAX_THEME, autocomplete: 'off',
          value: state.themes[day.id] || '', placeholder: day.theme,
          oninput: (event) => {
            const value = event.target.value.trim();
            if (value) state.themes[day.id] = value;
            else delete state.themes[day.id];
            save();
          },
        }))));
  }

  function backupPanel() {
    return h('section', { class: 'panel', 'aria-labelledby': 'backup-title' },
      h('h3', { id: 'backup-title' }, 'Varmuuskopio'),
      h('p', null, 'Tiedot ovat vain tällä laitteella. Vie ne tiedostoon, jos haluat siirtää ne toiselle laitteelle tai säilyttää kopion.'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', id: 'export-btn', onclick: exportData }, 'Vie tiedot'),
        h('label', { class: 'btn file-label' }, 'Tuo tiedot',
          h('input', { type: 'file', id: 'import-input', accept: '.json,application/json', onchange: onImportFile }))),
      importError ? h('p', { class: 'error', role: 'alert' }, importError) : null,
      pendingImport ? h('div', { class: 'confirm', role: 'group', 'aria-label': 'Vahvista tietojen tuonti' },
        h('p', null, importSummary(pendingImport)),
        h('p', null, 'Tuonti korvaa kaikki tämän laitteen nykyiset tiedot.'),
        h('div', { class: 'btn-row' },
          h('button', {
            type: 'button', class: 'btn btn-primary', id: 'import-confirm',
            onclick: () => {
              state = pendingImport;
              pendingImport = null;
              save();
              applyTheme();
              render('#settings-title');
              showToast('Tiedot tuotu.');
            },
          }, 'Korvaa tiedot'),
          h('button', {
            type: 'button', class: 'btn',
            onclick: () => {
              pendingImport = null;
              render('#import-input');
            },
          }, 'Peruuta'))) : null);
  }

  function importSummary(data) {
    const custom = DAYS.reduce((sum, day) => sum + data.custom[day.id].length, 0);
    return `Tiedostossa on ${Object.keys(data.selected).length} valittua ruokaa ja ${custom} omaa ruokaa.`;
  }

  function exportData() {
    const payload = { app: APP_ID, schema: SCHEMA, exportedAt: new Date().toISOString(), data: state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `vegesaurus-varmuuskopio-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast('Varmuuskopio ladattu.');
  }

  async function onImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    importError = '';
    pendingImport = null;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('size');
      const parsed = JSON.parse(await file.text());
      if (!isObject(parsed) || parsed.app !== APP_ID || !isObject(parsed.data)) throw new Error('format');
      if (typeof parsed.schema !== 'number' || parsed.schema > SCHEMA) throw new Error('schema');
      pendingImport = sanitizeState(parsed.data);
      render('#import-confirm');
    } catch (e) {
      importError = e.message === 'schema'
        ? 'Varmuuskopio on tehty sovelluksen uudemmalla versiolla. Lataa sivu uudelleen ja yritä sitten uudestaan.'
        : 'Tiedostoa ei voitu lukea. Valitse tästä sovelluksesta viety JSON-tiedosto.';
      render('#import-input');
    }
  }

  function resetPanel() {
    const cancel = h('button', {
      type: 'button', class: 'btn',
      onclick: () => {
        resetStep = 0;
        render('#reset-btn');
      },
    }, 'Peruuta');

    let body;
    if (resetStep === 0) {
      body = h('div', { class: 'btn-row' }, h('button', {
        type: 'button', class: 'btn', id: 'reset-btn',
        onclick: () => {
          resetStep = 1;
          render('#reset-step1');
        },
      }, 'Palauta oletukset'));
    } else if (resetStep === 1) {
      body = h('div', { class: 'confirm', role: 'group', 'aria-label': 'Vahvistus, vaihe 1 kahdesta' },
        h('p', null, 'Vaihe 1/2: Tämä poistaa omat ruoat, valinnat, muokkaukset, vegaani-merkinnät ja teemat. Vie tiedot ensin, jos haluat säilyttää ne.'),
        h('div', { class: 'btn-row' },
          h('button', {
            type: 'button', class: 'btn btn-primary', id: 'reset-step1',
            onclick: () => {
              resetStep = 2;
              render('#reset-step2');
            },
          }, 'Jatka'),
          cancel));
    } else {
      body = h('div', { class: 'confirm', role: 'group', 'aria-label': 'Vahvistus, vaihe 2 kahdesta' },
        h('p', null, 'Vaihe 2/2: Oletko varma? Poistoa ei voi perua.'),
        h('div', { class: 'btn-row' },
          h('button', {
            type: 'button', class: 'btn btn-primary', id: 'reset-step2',
            onclick: () => {
              state = emptyState();
              resetStep = 0;
              save();
              applyTheme();
              render('#settings-title');
              showToast('Oletukset palautettu.');
            },
          }, 'Poista tiedot ja palauta oletukset'),
          cancel));
    }
    return h('section', { class: 'panel', 'aria-labelledby': 'reset-title' },
      h('h3', { id: 'reset-title' }, 'Palauta oletukset'),
      h('p', null, 'Palauttaa sovelluksen siihen tilaan, jossa se oli ensimmäisellä avauskerralla.'),
      body);
  }

  function howtoPanel() {
    return h('section', { class: 'panel howto', 'aria-labelledby': 'howto-title' },
      h('h3', { id: 'howto-title' }, 'Lisää kotinäytölle'),
      h('details', null,
        h('summary', null, 'iPhone (Safari)'),
        h('ol', null,
          h('li', null, 'Avaa sovelluksen osoite Safarissa.'),
          h('li', null, 'Napauta Jaa-painiketta (neliö, josta nuoli osoittaa ylös).'),
          h('li', null, 'Valitse listasta ”Lisää Koti-valikkoon”.'),
          h('li', null, 'Napauta ”Lisää”.'))),
      h('details', null,
        h('summary', null, 'Android (Chrome)'),
        h('ol', null,
          h('li', null, 'Avaa sovelluksen osoite Chromessa.'),
          h('li', null, 'Napauta oikean yläkulman kolmea pistettä.'),
          h('li', null, 'Valitse ”Asenna sovellus” tai ”Lisää aloitusnäytölle”.'),
          h('li', null, 'Vahvista napauttamalla ”Asenna” tai ”Lisää”.'))),
      h('p', null, 'Valikkojen nimet voivat vaihdella hieman puhelimen ja selaimen version mukaan.'));
  }

  /* ---------- Käynnistys ---------- */

  const view = document.getElementById('view');
  const tabs = document.getElementById('tabs');
  const toast = document.getElementById('toast');
  const settingsBtn = document.getElementById('settings-btn');
  const storageWarning = document.getElementById('storage-warning');
  const logoBtn = document.getElementById('logo-btn');

  let state = loadState();
  applyTheme();
  applyLogoMotion();

  logoBtn.addEventListener('click', () => {
    state.logoPaused = !isLogoPaused();
    save();
    applyLogoMotion();
  });

  settingsBtn.addEventListener('click', () => {
    if (current !== 'asetukset') navigate('asetukset', false);
  });
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id !== current) show(id);
  });
  if (darkQuery) darkQuery.addEventListener('change', applyTheme);

  // Sovellus avautuu aina kuluvaan viikonpäivään, vaikka osoitteessa olisi vanha #-osa.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  buildTabs();
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
