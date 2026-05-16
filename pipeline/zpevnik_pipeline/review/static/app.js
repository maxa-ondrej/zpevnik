(() => {
  const listEl = document.getElementById('song-list');
  const detailEl = document.getElementById('detail');
  const searchEl = document.getElementById('search');
  const tpl = document.getElementById('detail-template');

  let allSongs = [];
  let currentId = null;
  let currentDetail = null;

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
    const r = await fetch(`/api/songs/${encodeURIComponent(id)}`);
    if (!r.ok) {
      detailEl.replaceChildren(
        Object.assign(document.createElement('div'), {
          className: 'empty',
          textContent: `Couldn't load song: ${r.status}`,
        }),
      );
      return;
    }
    currentDetail = await r.json();
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

    form.addEventListener('submit', onSave);
    node.querySelector('#reload').addEventListener('click', () => selectSong(currentId));

    detailEl.replaceChildren(node);
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
    try {
      const r = await fetch(`/api/songs/${encodeURIComponent(currentId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`${r.status}: ${body}`);
      }
      currentDetail = await r.json();
      await loadList();
      renderDetail();
      // renderDetail rebuilt the form; write the success message into the
      // freshly mounted #save-status node.
      const newStatus = document.getElementById('save-status');
      if (newStatus) {
        newStatus.textContent = 'Saved.';
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
})();
