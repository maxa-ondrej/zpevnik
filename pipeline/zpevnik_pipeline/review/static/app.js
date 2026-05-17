import { assembleAbc } from '/static/assemble.js';
import { transformChord } from '/static/chord.js';
import { parseChordPro } from '/static/chordpro.js';

const listEl = document.getElementById('song-list');
const detailEl = document.getElementById('detail');
const searchEl = document.getElementById('search');
const detailTpl = document.getElementById('detail-template');
const blockTpl = document.getElementById('block-template');

const EMPTY_MELODY = { header: '', blocks: [] };
const BLOCK_TYPES = ['verse', 'chorus', 'bridge'];
const NOTATION_DEBOUNCE_MS = 300;
const CHORDPRO_DEBOUNCE_MS = 150;

const TRANSPOSE_MIN = -11;
const TRANSPOSE_MAX = 11;

let allSongs = [];
let currentId = null;
let currentDetail = null;
/** Last-known server state — never mutated; used for dirty detection. */
let loadedMelody = null;
/** Mutable working copy bound to the structured editor. */
let currentMelody = cloneMelody(EMPTY_MELODY);
let notationDebounce = null;
let chordproDebounce = null;
/** Preview-only — does not mutate the stored chordpro. */
let previewNotation = 'cs';
let previewTranspose = 0;

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

  form.chordpro.addEventListener('input', () => scheduleChordproRender());

  // Preview-only controls — these do NOT mutate song.cho, they only
  // re-render the chord chart so the reviewer can spot-check Cs/En
  // and transpose without saving.
  const controls = node.querySelector('#chordpro-controls');
  controls.querySelectorAll('button[data-act="notation"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      previewNotation = btn.dataset.value;
      updatePreviewControlState();
      renderChordpro();
    });
  });
  controls.querySelector('button[data-act="transpose-down"]').addEventListener('click', () => {
    previewTranspose = Math.max(TRANSPOSE_MIN, previewTranspose - 1);
    updatePreviewControlState();
    renderChordpro();
  });
  controls.querySelector('button[data-act="transpose-up"]').addEventListener('click', () => {
    previewTranspose = Math.min(TRANSPOSE_MAX, previewTranspose + 1);
    updatePreviewControlState();
    renderChordpro();
  });

  form.addEventListener('submit', onSave);
  node.querySelector('#reload').addEventListener('click', () => selectSong(currentId));

  detailEl.replaceChildren(node);

  updatePreviewControlState();
  renderBlocks();
  // Initial paint of both previews. Wait a tick so the template has
  // been attached and the target nodes are reachable.
  scheduleNotationRender(0);
  scheduleChordproRender(0);
}

function updatePreviewControlState() {
  const controls = document.getElementById('chordpro-controls');
  if (!controls) return;
  controls.querySelectorAll('button[data-act="notation"]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === previewNotation);
  });
  controls
    .querySelector('button[data-act="transpose-down"]')
    .toggleAttribute('disabled', previewTranspose <= TRANSPOSE_MIN);
  controls
    .querySelector('button[data-act="transpose-up"]')
    .toggleAttribute('disabled', previewTranspose >= TRANSPOSE_MAX);
  const valueEl = document.getElementById('chordpro-transpose-value');
  if (valueEl) {
    valueEl.textContent =
      previewTranspose > 0 ? `+${previewTranspose}` : String(previewTranspose);
  }
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
    upBtn.addEventListener('click', () => moveBlock(idx, -1));

    const downBtn = card.querySelector('[data-act="down"]');
    downBtn.disabled = idx === currentMelody.blocks.length - 1;
    downBtn.addEventListener('click', () => moveBlock(idx, 1));

    const deleteBtn = card.querySelector('[data-act="delete"]');
    deleteBtn.addEventListener('click', () => {
      currentMelody.blocks.splice(idx, 1);
      renderBlocks();
      scheduleNotationRender();
    });

    // Keyboard: Alt+↑ / Alt+↓ to swap with the previous/next block.
    // Lives on the card so it fires no matter which inner control is
    // focused (textarea, select, button).
    card.addEventListener('keydown', (ev) => {
      if (!ev.altKey) return;
      if (ev.key === 'ArrowUp' && idx > 0) {
        ev.preventDefault();
        moveBlock(idx, -1);
      } else if (ev.key === 'ArrowDown' && idx < currentMelody.blocks.length - 1) {
        ev.preventDefault();
        moveBlock(idx, 1);
      }
    });

    wireBlockDragHandlers(card, idx);

    container.appendChild(cardNode);
  });
}

function wireBlockDragHandlers(card, idx) {
  card.addEventListener('dragstart', (ev) => {
    // Inside a textarea the browser already handles text-drag — let it.
    if (ev.target instanceof HTMLTextAreaElement) {
      ev.preventDefault();
      return;
    }
    ev.dataTransfer.setData('text/plain', String(idx));
    ev.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document
      .querySelectorAll('#melody-blocks .melody-block.drop-target')
      .forEach((el) => el.classList.remove('drop-target'));
  });
  card.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    card.classList.add('drop-target');
  });
  card.addEventListener('dragleave', () => {
    card.classList.remove('drop-target');
  });
  card.addEventListener('drop', (ev) => {
    ev.preventDefault();
    card.classList.remove('drop-target');
    const fromIdx = Number(ev.dataTransfer.getData('text/plain'));
    if (!Number.isInteger(fromIdx) || fromIdx === idx) return;
    const [moved] = currentMelody.blocks.splice(fromIdx, 1);
    // After splicing out, the visual index of `idx` may have shifted by one
    // if we removed from before it.
    const targetIdx = fromIdx < idx ? idx - 1 : idx;
    currentMelody.blocks.splice(targetIdx, 0, moved);
    renderBlocks();
    focusBlockAt(targetIdx);
    scheduleNotationRender();
  });
}

function focusBlockAt(idx) {
  const cards = document.querySelectorAll('#melody-blocks .melody-block');
  cards[idx]?.querySelector('textarea')?.focus();
}

function moveBlock(idx, dir) {
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= currentMelody.blocks.length) return;
  [currentMelody.blocks[targetIdx], currentMelody.blocks[idx]] = [
    currentMelody.blocks[idx],
    currentMelody.blocks[targetIdx],
  ];
  renderBlocks();
  focusBlockAt(targetIdx);
  scheduleNotationRender();
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

function scheduleChordproRender(delay = CHORDPRO_DEBOUNCE_MS) {
  if (chordproDebounce !== null) {
    clearTimeout(chordproDebounce);
  }
  chordproDebounce = setTimeout(() => {
    chordproDebounce = null;
    renderChordpro();
  }, delay);
}

function renderChordpro() {
  const target = document.getElementById('chordpro-target');
  const status = document.getElementById('chordpro-status');
  if (!target || !status) return;

  const form = document.getElementById('edit-form');
  const source = form?.chordpro?.value ?? '';
  if (source.trim().length === 0) {
    status.textContent = 'Empty — type chord/lyric content to preview.';
    status.dataset.tone = 'muted';
    target.replaceChildren();
    return;
  }

  const parsed = parseChordPro(source);
  target.replaceChildren();

  let lineCount = 0;
  parsed.lines.forEach((line) => {
    const row = document.createElement('div');
    row.className = 'cp-line';
    if (line.section === 'chorus') row.classList.add('cp-chorus');
    if (line.section === 'bridge') row.classList.add('cp-bridge');

    if (line.segments.length === 0) {
      row.classList.add('cp-blank');
      target.appendChild(row);
      return;
    }
    lineCount += 1;

    line.segments.forEach((seg) => {
      const cell = document.createElement('div');
      cell.className = 'cp-cell';
      const chord = document.createElement('span');
      chord.className = 'cp-chord';
      const rendered = seg.chord
        ? transformChord(seg.chord, previewTranspose, previewNotation)
        : null;
      // nbsp keeps the row height stable even when the segment has no chord.
      chord.textContent = rendered ?? ' ';
      const lyric = document.createElement('span');
      lyric.className = 'cp-lyric';
      lyric.textContent = seg.text.length > 0 ? seg.text : ' ';
      cell.appendChild(chord);
      cell.appendChild(lyric);
      row.appendChild(cell);
    });
    target.appendChild(row);
  });

  const xposeNote =
    previewTranspose !== 0
      ? ` · ${previewTranspose > 0 ? '+' : ''}${previewTranspose}`
      : '';
  status.textContent = `${lineCount} line${lineCount === 1 ? '' : 's'} · ${previewNotation}${xposeNote}`;
  status.dataset.tone = 'ok';
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
