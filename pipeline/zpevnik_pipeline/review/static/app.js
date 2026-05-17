import { assembleAbc } from '/static/assemble.js';

const listEl = document.getElementById('song-list');
const detailEl = document.getElementById('detail');
const searchEl = document.getElementById('search');
const detailTpl = document.getElementById('detail-template');
const blockTpl = document.getElementById('block-template');

const EMPTY_MELODY = { header: '', blocks: [] };
const BLOCK_TYPES = ['verse', 'chorus', 'bridge'];
const NOTATION_DEBOUNCE_MS = 300;

let allSongs = [];
let currentId = null;
let currentDetail = null;
/** Last-known server state — never mutated; used for dirty detection. */
let loadedMelody = null;
/** Mutable working copy bound to the structured editor. */
let currentMelody = cloneMelody(EMPTY_MELODY);
let notationDebounce = null;

const fold = (s) =>
  (s ?? '').toString().normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();

function cloneMelody(m) {
  return {
    header: String(m?.header ?? ''),
    blocks: Array.isArray(m?.blocks)
      ? m.blocks.map((b) => ({
          type: BLOCK_TYPES.includes(b?.type) ? b.type : 'verse',
          body: String(b?.body ?? ''),
        }))
      : [],
  };
}

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
    loadedMelody = null;
  } else {
    loadedMelody = null;
    console.warn(`GET melody.json failed (${melodyRes.status})`);
  }

  currentMelody = cloneMelody(loadedMelody ?? EMPTY_MELODY);
  renderDetail();
}

function renderDetail() {
  const node = detailTpl.content.cloneNode(true);
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

  const headerArea = form.querySelector('textarea[name="melodyHeader"]');
  headerArea.value = currentMelody.header;
  headerArea.addEventListener('input', () => {
    currentMelody.header = headerArea.value;
    scheduleNotationRender();
  });

  const addRow = form.querySelector('#melody-add-row');
  addRow.querySelectorAll('button[data-add-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMelody.blocks.push({ type: btn.dataset.addType, body: '' });
      renderBlocks();
      const cards = document.querySelectorAll('#melody-blocks .melody-block');
      cards[cards.length - 1]?.querySelector('textarea')?.focus();
      scheduleNotationRender();
    });
  });

  form.addEventListener('submit', onSave);
  node.querySelector('#reload').addEventListener('click', () => selectSong(currentId));

  detailEl.replaceChildren(node);

  renderBlocks();
  // Initial paint of the notation preview. Wait a tick so the template has
  // been attached and the #notation-target node is reachable.
  scheduleNotationRender(0);
}

function renderBlocks() {
  const container = document.getElementById('melody-blocks');
  if (!container) return;
  container.replaceChildren();

  if (currentMelody.blocks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'melody-blocks-empty';
    empty.textContent = 'No blocks yet — add one below.';
    container.appendChild(empty);
    return;
  }

  currentMelody.blocks.forEach((block, idx) => {
    const cardNode = blockTpl.content.cloneNode(true);
    const card = cardNode.querySelector('.melody-block');
    card.dataset.type = block.type;
    card.dataset.index = String(idx);

    const select = card.querySelector('[data-act="type"]');
    select.value = block.type;
    select.addEventListener('change', () => {
      currentMelody.blocks[idx].type = select.value;
      card.dataset.type = select.value;
      scheduleNotationRender();
    });

    const bodyArea = card.querySelector('[data-act="body"]');
    bodyArea.value = block.body;
    bodyArea.addEventListener('input', () => {
      currentMelody.blocks[idx].body = bodyArea.value;
      scheduleNotationRender();
    });

    const upBtn = card.querySelector('[data-act="up"]');
    upBtn.disabled = idx === 0;
    upBtn.addEventListener('click', () => {
      [currentMelody.blocks[idx - 1], currentMelody.blocks[idx]] = [
        currentMelody.blocks[idx],
        currentMelody.blocks[idx - 1],
      ];
      renderBlocks();
      focusBlockAt(idx - 1);
      scheduleNotationRender();
    });

    const downBtn = card.querySelector('[data-act="down"]');
    downBtn.disabled = idx === currentMelody.blocks.length - 1;
    downBtn.addEventListener('click', () => {
      [currentMelody.blocks[idx + 1], currentMelody.blocks[idx]] = [
        currentMelody.blocks[idx],
        currentMelody.blocks[idx + 1],
      ];
      renderBlocks();
      focusBlockAt(idx + 1);
      scheduleNotationRender();
    });

    const deleteBtn = card.querySelector('[data-act="delete"]');
    deleteBtn.addEventListener('click', () => {
      currentMelody.blocks.splice(idx, 1);
      renderBlocks();
      scheduleNotationRender();
    });

    container.appendChild(cardNode);
  });
}

function focusBlockAt(idx) {
  const cards = document.querySelectorAll('#melody-blocks .melody-block');
  cards[idx]?.querySelector('textarea')?.focus();
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
  if (!target || !status) return;

  if (!currentMelody.header.trim() && currentMelody.blocks.length === 0) {
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

  const abc = assembleAbc({
    header: currentMelody.header,
    blocks: currentMelody.blocks,
  });

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
  if (form.reviewStatus.value !== currentDetail.meta.reviewStatus) {
    payload.reviewStatus = form.reviewStatus.value;
  }

  const melodyPayload = cloneMelody(currentMelody);

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
      currentMelody = cloneMelody(loadedMelody);
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
