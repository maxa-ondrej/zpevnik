import { assembleAbc } from '/static/assemble.js';

const listEl = document.getElementById('song-list');
const detailEl = document.getElementById('detail');
const searchEl = document.getElementById('search');
const tpl = document.getElementById('detail-template');

const EMPTY_MELODY = { header: '', blocks: [] };
const BLOCK_TYPES = new Set(['verse', 'chorus', 'bridge']);
const NOTATION_DEBOUNCE_MS = 300;

let allSongs = [];
let currentId = null;
let currentDetail = null;
/** Mirrors what was loaded from the server so we know whether to PUT melody. */
let loadedMelody = null;
let notationDebounce = null;

const fold = (s) =>
  (s ?? '').toString().normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();

async function loadList() {
  const r = await fetch('/api/songs');
  if (!r.ok) throw new Error(`GET /api/songs ${r.status}`);
  const body = await r.json();
  allSongs = body.songs;
  renderList();
}

function renderList() {
  const q = fold(searchEl.value).trim();
  const filtered = q
    ? allSongs.filter(
        (s) => fold(s.title).includes(q) || String(s.number ?? '').includes(q),
      )
    : allSongs;
  listEl.replaceChildren(
    ...filtered.map((s) => {
      const li = document.createElement('li');
      li.dataset.id = s.id;
      if (s.id === currentId) li.classList.add('active');
      li.innerHTML = `
        <span class="num">${s.number ?? ''}</span>
        <span class="title"></span>
        <span class="status" data-status="${s.reviewStatus}">${s.reviewStatus}</span>
      `;
      li.querySelector('.title').textContent = s.title;
      li.addEventListener('click', () => selectSong(s.id));
      return li;
    }),
  );
  if (filtered.length === 0) {
    const empty = document.createElement('li');
    empty.style.cssText = 'padding: 16px; color: var(--muted); cursor: default;';
    empty.textContent = 'No matches.';
    listEl.appendChild(empty);
  }
}

async function selectSong(id) {
  currentId = id;
  listEl.querySelectorAll('li').forEach((li) =>
    li.classList.toggle('active', li.dataset.id === id),
  );
  detailEl.replaceChildren(document.createTextNode('Loading…'));

  const detailReq = fetch(`/api/songs/${encodeURIComponent(id)}`);
  const melodyReq = fetch(`/api/songs/${encodeURIComponent(id)}/melody`);
  const [detailRes, melodyRes] = await Promise.all([detailReq, melodyReq]);

  if (!detailRes.ok) {
    detailEl.replaceChildren(
      Object.assign(document.createElement('div'), {
        className: 'empty',
        textContent: `Couldn't load song: ${detailRes.status}`,
      }),
    );
    return;
  }
  currentDetail = await detailRes.json();

  if (melodyRes.status === 200) {
    loadedMelody = await melodyRes.json();
  } else if (melodyRes.status === 404) {
    // No sidecar yet — surface an editable stub the user can fill in.
    loadedMelody = null;
  } else {
    loadedMelody = null;
    console.warn(`GET melody.json failed (${melodyRes.status})`);
  }

  renderDetail();
}

function renderDetail() {
  const node = tpl.content.cloneNode(true);
  const m = currentDetail.meta;

  node.querySelector('[data-bind="reviewStatus"]').textContent = m.reviewStatus;
  node.querySelector('[data-bind="reviewStatus"]').dataset.status = m.reviewStatus;
  node.querySelector('[data-bind="id"]').textContent = `#${m.id}`;
  node.querySelector('[data-bind="title-display"]').textContent =
    m.number !== null ? `${m.number}. ${m.title}` : m.title;

  const staves = node.querySelector('section.staves');
  if (currentDetail.staveUrls.length > 0) {
    staves.hidden = false;
    currentDetail.staveUrls.forEach((u) => {
      const img = document.createElement('img');
      img.src = u;
      img.alt = 'Stave';
      staves.appendChild(img);
    });
  }

  const form = node.querySelector('form');
  form.title.value = m.title;
  form.number.value = m.number ?? '';
  form.key.value = m.key ?? '';
  form.tempo.value = m.tempo ?? '';
  form.chordpro.value = currentDetail.chordpro;
  form.reviewStatus.value = m.reviewStatus;

  const melodyForForm = loadedMelody ?? EMPTY_MELODY;
  form.melody.value = JSON.stringify(melodyForForm, null, 2);

  form.addEventListener('submit', onSave);
  node.querySelector('#reload').addEventListener('click', () => selectSong(currentId));
  form.melody.addEventListener('input', () => scheduleNotationRender());

  detailEl.replaceChildren(node);

  // Initial paint of the notation preview. Wait a tick so the template has
  // been attached and the #notation-target node is reachable by id.
  scheduleNotationRender(0);
}

function scheduleNotationRender(delay = NOTATION_DEBOUNCE_MS) {
  if (notationDebounce !== null) {
    clearTimeout(notationDebounce);
  }
  notationDebounce = setTimeout(() => {
    notationDebounce = null;
    renderNotation();
  }, delay);
}

function renderNotation() {
  const target = document.getElementById('notation-target');
  const status = document.getElementById('notation-status');
  if (!target) return;

  const form = document.getElementById('edit-form');
  if (!form) return;

  const raw = form.melody.value;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    status.textContent = `JSON: ${err.message}`;
    status.dataset.tone = 'error';
    target.innerHTML = '';
    return;
  }

  if (typeof parsed?.header !== 'string' || !Array.isArray(parsed?.blocks)) {
    status.textContent = 'melody.json missing header/blocks';
    status.dataset.tone = 'error';
    target.innerHTML = '';
    return;
  }
  const badBlock = parsed.blocks.find(
    (b) =>
      !b ||
      typeof b !== 'object' ||
      !BLOCK_TYPES.has(b.type) ||
      typeof b.body !== 'string',
  );
  if (badBlock) {
    status.textContent = 'each block needs {type: verse|chorus|bridge, body: string}';
    status.dataset.tone = 'error';
    target.innerHTML = '';
    return;
  }

  if (!parsed.header.trim() && parsed.blocks.length === 0) {
    status.textContent = 'Empty melody — fill in header + blocks to preview.';
    status.dataset.tone = 'muted';
    target.innerHTML = '';
    return;
  }

  if (typeof window.ABCJS === 'undefined') {
    status.textContent = 'abcjs not loaded yet — retrying…';
    status.dataset.tone = 'muted';
    setTimeout(renderNotation, 200);
    return;
  }

  const abc = assembleAbc({ header: parsed.header, blocks: parsed.blocks });

  try {
    // NOTE: do NOT pass `responsive: 'resize'` — it silently neutralises
    // the `scale` option (documented bug carried over from the app).
    window.ABCJS.renderAbc(target, abc, {
      staffwidth: 740,
      scale: 1.25,
      paddingleft: 0,
      paddingright: 0,
      paddingtop: 0,
      paddingbottom: 12,
      lineThickness: 0.2,
    });
    status.textContent = 'OK';
    status.dataset.tone = 'ok';
  } catch (err) {
    status.textContent = `abcjs: ${err.message ?? err}`;
    status.dataset.tone = 'error';
    target.innerHTML = '';
  }
}

async function onSave(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  const status = form.querySelector('#save-status');
  const saveBtn = form.querySelector('#save');
  status.textContent = 'Saving…';
  status.dataset.tone = '';
  saveBtn.disabled = true;

  const payload = {
    title: form.title.value,
    number: form.number.value === '' ? null : Number(form.number.value),
    key: form.key.value === '' ? null : form.key.value,
    tempo: form.tempo.value === '' ? null : Number(form.tempo.value),
    chordpro: form.chordpro.value,
  };
  // Only send reviewStatus if the user picked a different value than the
  // current state — that way the server's auto→flagged auto-promotion
  // kicks in when the user edits content without touching the dropdown.
  if (form.reviewStatus.value !== currentDetail.meta.reviewStatus) {
    payload.reviewStatus = form.reviewStatus.value;
  }

  // Parse the melody textarea up-front so we can fail fast (and clearly)
  // before we touch the network.
  let melodyPayload;
  try {
    melodyPayload = JSON.parse(form.melody.value);
  } catch (err) {
    status.textContent = `melody.json: ${err.message}`;
    status.dataset.tone = 'error';
    saveBtn.disabled = false;
    return;
  }

  // Decide whether to PUT the melody. We always send it when the user
  // edited the field, but if they left an absent-melody stub at its
  // defaults we skip the write to avoid creating an empty file.
  const melodyChanged =
    JSON.stringify(melodyPayload) !==
    JSON.stringify(loadedMelody ?? EMPTY_MELODY);
  const stubUnchanged =
    loadedMelody === null &&
    JSON.stringify(melodyPayload) === JSON.stringify(EMPTY_MELODY);
  const shouldWriteMelody = melodyChanged && !stubUnchanged;

  try {
    const r = await fetch(`/api/songs/${encodeURIComponent(currentId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`song PUT ${r.status}: ${body}`);
    }
    currentDetail = await r.json();

    if (shouldWriteMelody) {
      const mr = await fetch(
        `/api/songs/${encodeURIComponent(currentId)}/melody`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(melodyPayload),
        },
      );
      if (!mr.ok) {
        const body = await mr.text();
        throw new Error(`melody PUT ${mr.status}: ${body}`);
      }
      loadedMelody = await mr.json();
    }

    await loadList();
    renderDetail();
    const newStatus = document.getElementById('save-status');
    if (newStatus) {
      newStatus.textContent = shouldWriteMelody ? 'Saved (song + melody).' : 'Saved.';
      newStatus.dataset.tone = 'ok';
    }
  } catch (err) {
    status.textContent = String(err);
    status.dataset.tone = 'error';
  } finally {
    saveBtn.disabled = false;
  }
}

searchEl.addEventListener('input', renderList);

loadList().catch((err) => {
  listEl.replaceChildren(
    Object.assign(document.createElement('li'), { textContent: String(err) }),
  );
});
