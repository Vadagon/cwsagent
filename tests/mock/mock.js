// A stand-in for the Web Store developer console, built from the structure seen
// on the live console on 2026-10-19: controls labelled through aria-labelledby,
// listbox selects with disabled group headers, image slots marked with
// data-image-upload-type, and localized fields that swap with the language.
// The Support URL field throws away anything typed, to test failure reporting.
(() => {
  let uid = 0;
  const id = () => `m${++uid}`;
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
      else if (v !== undefined && v !== null) e.setAttribute(k, v);
    }
    for (const k of kids) e.append(k);
    return e;
  };
  const label = (text) => { const s = el('span', { id: id() }, text); return s; };

  function field(tag, text, extra = {}) {
    const l = label(text);
    const input = el(tag, { 'aria-labelledby': l.id, ...extra });
    return { wrap: el('div', { class: 'field' }, l, input), input };
  }

  function select(name, options, current, onPick) {
    const l = label(name);
    const value = el('span', { id: id() }, current);
    const combo = el('div', { role: 'combobox', 'aria-labelledby': `${l.id} ${value.id}`, tabindex: 0 }, l, ' ', value);
    const list = el('ul', { role: 'listbox', 'aria-label': name, hidden: '' });
    for (const o of options) {
      list.append(el('li', {
        role: 'option', 'data-value': o.value, 'aria-disabled': o.disabled ? 'true' : null,
        on: { click: () => { if (o.disabled) return; value.textContent = o.text; onPick?.(o.value); } },
      }, o.text));
    }
    combo.addEventListener('click', () => { list.hidden = !list.hidden; });
    return { wrap: el('div', { class: 'field' }, combo, list), value };
  }

  function uploadSlot(type, global, title, initial, multi) {
    const box = el('div', { 'data-image-upload-type': type, 'data-is-global': global ? 'true' : null });
    const input = el('input', { type: 'file', accept: '.png,.jpg,.jpeg' });
    const shots = el('div', { class: 'shots' });
    box.append(shots, input);
    const section = el('section', { class: 'slot' }, el('h4', {}, title), box);
    const add = (src) => {
      const n = shots.children.length + 1;
      const item = el('div', { 'data-image-key': `k${uid++}` }, el('img', { src, alt: '' }));
      if (multi) {
        item.append(el('button', { 'aria-label': `Remove image Screenshot ${n}`, on: { click: () => item.remove() } }, '✕'));
        shots.append(item);
      } else {
        shots.replaceChildren(item);
      }
    };
    const set = (srcs) => { shots.replaceChildren(); srcs.forEach(add); };
    const get = () => [...shots.querySelectorAll('img')].map((i) => i.src);
    input.addEventListener('change', () => {
      const f = input.files[0];
      window.__uploads = [...(window.__uploads ?? []), { type, global, name: f.name, mime: f.type, size: f.size }];
      setTimeout(() => add(URL.createObjectURL(f)), 200);
    });
    set(initial);
    return { section, set, get };
  }

  const main = el('main');
  document.body.append(el('h1', {}, 'Mock Extension – Test Item'), main);
  const page = document.body.dataset.page;
  const img = (name) => `/img/${name}=w320-h200-rw`;

  if (page === 'listing') {
    const LANGS = [['en', 'English – en (default)'], ['de', 'German – de'], ['fr', 'French – fr'], ['iw', 'Hebrew – iw'], ['pt-BR', 'Portuguese (Brazil) – pt-BR']];
    const state = Object.fromEntries(LANGS.map(([v]) => [v, { description: `Existing ${v} description`, video: '', shots: [] }]));
    state.de.shots = [img('shot2.png')];
    let current = 'en';

    const desc = field('textarea', 'Description*', { maxlength: '16000' });
    const locVideo = field('input', 'Localized promo video', { type: 'text' });
    let locShots;
    const lang = select('Language', LANGS.map(([value, text]) => ({ value, text })), LANGS[0][1], (v) => {
      state[current] = { description: desc.input.value, video: locVideo.input.value, shots: locShots.get() };
      current = v;
      setTimeout(() => {
        desc.input.value = state[v].description;
        locVideo.input.value = state[v].video;
        locShots.set(state[v].shots);
      }, 150);
    });
    const category = select('Category', [
      { value: 'Select a category', text: 'Select a category' },
      { value: 'CATEGORY_PRODUCTIVITY', text: 'PRODUCTIVITY', disabled: true },
      { value: 'CATEGORY_DEVELOPER_TOOLS', text: 'Developer Tools' },
      { value: 'CATEGORY_TOOLS', text: 'Tools' },
      { value: 'CATEGORY_WORKFLOW_AND_PLANNING', text: 'Workflow & Planning' },
    ], 'Workflow & Planning');
    const official = select('Official URL', [{ value: 'none', text: 'None' }, { value: 'ex', text: 'example.com' }], 'None');
    const home = field('input', 'Homepage URL', { type: 'text' });
    const support = field('input', 'Support URL', { type: 'text' });
    support.input.addEventListener('change', () => { support.input.value = ''; });
    const globalVideo = field('input', 'Global promo video', { type: 'text' });
    const matureLabel = label('Mature content');
    const mature = el('button', { role: 'switch', 'aria-checked': 'false', 'aria-labelledby': matureLabel.id,
      on: { click: (e) => e.currentTarget.setAttribute('aria-checked', String(e.currentTarget.getAttribute('aria-checked') !== 'true')) } });

    const icon = uploadSlot('5', true, 'Store icon', [img('icon.png')], false);
    locShots = uploadSlot('4', false, 'Localized screenshots', [], true);
    const globalShots = uploadSlot('4', true, 'Global screenshots', [img('shot1.png'), img('shot2.png'), img('shot3.png')], true);
    const small = uploadSlot('1', true, 'Small promo tile', [img('small.png')], false);
    const marquee = uploadSlot('3', true, 'Marquee promo tile', [], false);

    desc.input.value = state.en.description;
    home.input.value = 'https://old.example.com';
    main.append(lang.wrap, desc.wrap, category.wrap, icon.section, locVideo.wrap, locShots.section, globalVideo.wrap,
      globalShots.section, small.section, marquee.section, official.wrap, home.wrap, support.wrap, el('div', {}, matureLabel, mature));
    window.__mock = { state: () => ({ ...state, [current]: { description: desc.input.value, video: locVideo.input.value, shots: locShots.get() } }), current: () => current, globalShots, category, home, support, mature };
  }

  if (page === 'privacy') {
    const add = (f) => { main.append(f.wrap); return f.input; };
    add(field('textarea', 'Single purpose description*', { maxlength: '1000' }));
    add(field('textarea', 'storage justification*', { maxlength: '1000' }));
    add(field('textarea', 'activeTab justification*', { maxlength: '1000' }));
    add(field('textarea', 'Host permission justification*', { maxlength: '1000' }));
    const radio = (text, checked) => { const l = label(text); const r = el('input', { type: 'radio', name: 'rc', 'aria-labelledby': l.id }); r.checked = checked; main.append(el('div', {}, r, l)); };
    radio('No, I am not using remote code', true);
    radio('Yes, I am using remote code', false);
    add(field('textarea', 'Justification', { maxlength: '1000' }));
    const box = (text, checked) => { const l = label(text); const c = el('input', { type: 'checkbox', 'aria-labelledby': l.id }); c.checked = checked; main.append(el('div', {}, c, l)); };
    for (const t of ['Personally identifiable information', 'Health information', 'Financial and payment information', 'Authentication information',
      'Personal communications', 'Location', 'Web history', 'User activity', 'Website content']) box(t, t === 'Web history');
    box('I do not sell or transfer user data to third parties, outside of the approved use cases', false);
    box('I do not use or transfer user data for purposes that are unrelated to my item\'s single purpose', false);
    box('I do not use or transfer user data to determine creditworthiness or for lending purposes', false);
    add(field('input', 'Privacy policy URL*', { type: 'text', maxlength: '2048' }));
  }

  if (page === 'test') {
    main.append(field('input', 'Username', { type: 'text', maxlength: '100' }).wrap);
    const pw = field('input', 'Password', { type: 'password', maxlength: '100' });
    pw.input.value = 'secret-test-pw';
    main.append(pw.wrap, field('textarea', 'Additional instructions', { maxlength: '500' }).wrap);
  }

  if (page === 'analytics' || page === 'ratings') {
    // Default data embedded like the console does; a longer range is fetched in the background.
    const options = page === 'ratings'
      ? [['8', 'Last 30 days'], ['9', 'Last 90 days'], ['5', 'All time']]
      : [['8', 'Last 30 days'], ['9', 'Last 90 days'], ['7', 'Last 5 years']];
    const range = select('Date range', options.map(([value, text]) => ({ value, text })), 'Last 30 days', () => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/_/SnapcatUi/data/batchexecute?rpcids=WlSRsc');
      xhr.send('f.req=mock');
    });
    range.wrap.querySelector('ul').setAttribute('aria-label', 'Date range select menu');
    main.append(el('h2', {}, page === 'ratings' ? 'Ratings' : location.pathname.split('/').pop()), range.wrap);
    if (page === 'ratings') main.append(el('div', {}, 'Ratings'), el('div', {}, '3.3'), el('div', {}, 'Total ratings'), el('div', {}, '7'), el('div', {}, 'Ratings with reviews'), el('div', {}, '5'));
    window.__mock = { range };
  }

  if (page === 'support') {
    const ISSUES = [
      { date: 'Sep 19, 2026', type: 'Bug', subject: 'Export stalls', from: 'Sam Rivera', status: 'Open',
        message: 'The export stops at 50% and shows "retrying" forever.', version: '1.0.15', client: 'Mozilla/5.0 (Windows NT 10.0) Chrome/152',
        replies: [{ date: 'Oct 16, 2026', text: 'Fixed.', author: 'Owner' }] },
      { date: 'Sep 2, 2026', type: 'Question', subject: 'Stories, too?', from: 'Ana', status: 'In progress',
        message: 'Can it save stories, with commas, too?', version: '1.0.14', client: 'Mozilla/5.0 (Macintosh) Chrome/151', replies: [] },
      { date: 'Aug 30, 2026', type: 'Suggestion', subject: 'Dark mode', from: 'Kenji', status: 'Open',
        message: 'Please add dark mode.', version: '1.0.12', client: 'Mozilla/5.0 (X11; Linux) Chrome/150', replies: [] },
    ];
    const PAGE_SIZE = 2;
    let pageNo = 0;
    const table = el('table');
    const tbody = el('tbody');
    table.append(el('thead', {}, el('tr', {}, ...['', 'Date', 'Type', 'Subject', 'From', 'Status'].map((h) => el('th', {}, h)))), tbody);
    const counter = el('span');
    const next = el('button', { 'aria-label': 'Next page' }, 'navigate_next');
    const renderPage = () => {
      tbody.replaceChildren();
      for (const issue of ISSUES.slice(pageNo * PAGE_SIZE, pageNo * PAGE_SIZE + PAGE_SIZE)) {
        const row = el('tr', {}, el('td', {}, issue.date), el('td', {}, issue.type), el('td', {}, issue.subject), el('td', {}, issue.from),
          el('td', {}, el('div', { role: 'listbox', 'aria-label': 'Issue state' }, issue.status)));
        let open = [];
        row.firstChild.addEventListener('click', () => {
          if (open.length) { open.forEach((r) => r.remove()); open = []; return; }
          const reply = el('textarea', { 'aria-label': 'Your response' });
          reply.addEventListener('input', () => { window.__touched = true; });
          const publish = el('button', { on: { click: () => { window.__published = true; } } }, 'Publish reply');
          const detail = el('tr', {}, el('td', { colspan: '5' },
            el('div', {}, issue.message), el('div', {}, 'Your response'), reply, el('div', {}, '0/5,000'), publish,
            el('div', {}, `Item version: ${issue.version}`), el('div', {}, `Client Version: ${issue.client}`)));
          const replies = issue.replies.map((r) => el('tr', {}, el('td', {}, r.date), el('td', {}, 'Reply'), el('td', {}, r.text), el('td', {}, r.author), el('td', {})));
          open = [detail, ...replies];
          row.after(...open);
        });
        tbody.append(row);
      }
      counter.textContent = `Item ${pageNo + 1} of ${Math.ceil(ISSUES.length / PAGE_SIZE)}`;
      next.disabled = (pageNo + 1) * PAGE_SIZE >= ISSUES.length;
    };
    next.addEventListener('click', () => { pageNo++; renderPage(); });
    renderPage();
    main.append(el('h2', {}, 'User support'), table, counter, next);
  }

  if (!['analytics', 'ratings', 'support'].includes(page)) {
    document.body.append(el('button', {}, page === 'test' ? 'Save changes' : 'Save draft'));
  }
})();
