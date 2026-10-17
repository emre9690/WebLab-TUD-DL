// Folder picker: shows the course's folder tree (loaded lazily) with checkboxes.
const DEFAULTS = { includeMine: true, includeImages: true };
const $ = (id) => document.getElementById(id);
const msg = (s) => ($('msg').textContent = s);

let tabId = null;
const roots = []; // tree nodes: { id, title, url, isFolder, path, checked, parent, children, loaded, open, el }

async function send(message) {
  return chrome.tabs.sendMessage(tabId, message);
}

function makeNode(item, parent) {
  return {
    ...item,
    path: [...(parent ? parent.path : []), item.title],
    checked: parent ? parent.checked : false,
    parent,
    children: [],
    loaded: false,
    open: false,
  };
}

// --- checkbox logic: ticking a folder ticks everything in it ---

function setChecked(node, value) {
  node.checked = value;
  node.children.forEach((c) => setChecked(c, value));
}

function syncParents(node) {
  for (let p = node.parent; p; p = p.parent) p.checked = p.children.length > 0 && p.children.every((c) => c.checked);
}

function hasSelection(node) {
  return node.checked || node.children.some(hasSelection);
}

// "2 of 9 selected" for a partly ticked folder ("some selected" if a subfolder is itself partly ticked).
function partialLabel(node) {
  if (node.checked || !node.children.length) return '';
  const full = node.children.filter((c) => c.checked).length;
  const partly = node.children.filter((c) => !c.checked && hasSelection(c)).length;
  if (partly) return 'some selected';
  return full ? `${full} of ${node.children.length} selected` : '';
}

// The smallest set of ticked nodes: a ticked folder covers everything inside it.
function selection(nodes = roots, out = []) {
  for (const n of nodes) {
    if (n.checked) out.push(n);
    else selection(n.children, out);
  }
  return out;
}

// --- rendering ---

const CHEVRON = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function render() {
  const tree = $('tree');
  const scroll = tree.scrollTop;
  tree.textContent = '';
  if (!roots.length) {
    tree.innerHTML = '<div class="note">No folders found on this page.</div>';
  } else {
    tree.appendChild(renderList(roots));
  }
  tree.scrollTop = scroll;
  updateLinks();
  const picked = selection();
  renderSelected(picked);
  const n = picked.length;
  $('go').disabled = n === 0;
  $('go').textContent = n === 0 ? 'Select folders to download' : `Download ${n} item${n === 1 ? '' : 's'} as Markdown`;
  prefetch();
}

// Plain-words list of exactly what will be downloaded, with × to remove an item.
function renderSelected(picked) {
  const box = $('selected');
  box.textContent = '';
  if (!picked.length) return;
  const h = document.createElement('h2');
  h.textContent = 'Will download:';
  box.appendChild(h);
  for (const node of picked) {
    const row = document.createElement('div');
    row.className = 'item';
    const text = document.createElement('span');
    text.textContent = node.path.join(' › ');
    text.title = text.textContent;
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.title = 'Remove';
    remove.addEventListener('click', () => {
      setChecked(node, false);
      syncParents(node);
      render();
    });
    row.append(text, remove);
    box.appendChild(row);
  }
}

function renderList(nodes) {
  const ul = document.createElement('ul');
  for (const node of nodes) ul.appendChild(renderNode(node));
  return ul;
}

function renderNode(node) {
  const li = document.createElement('li');
  const row = document.createElement('div');
  row.className = `row${node.isFolder === false ? ' question' : ''}`;

  const twisty = document.createElement('button');
  twisty.className = `chev${node.open ? ' open' : ''}`;
  twisty.innerHTML = CHEVRON;
  twisty.disabled = node.isFolder === false || (node.loaded && !node.children.length);
  twisty.title = node.open ? 'Collapse' : 'Show contents';
  twisty.addEventListener('click', () => toggleOpen(node));

  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = node.checked;
  box.addEventListener('change', () => {
    setChecked(node, box.checked);
    syncParents(node);
    render();
  });
  const text = document.createElement('span');
  text.textContent = node.title;
  text.title = node.path.join(' › ');
  label.append(box, text);

  row.append(twisty, label);
  const note = node.loaded && node.isFolder && !node.children.length ? 'empty' : partialLabel(node);
  if (note) {
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = note;
    row.appendChild(count);
  }
  li.appendChild(row);
  if (node.open) {
    if (!node.loaded) li.insertAdjacentHTML('beforeend', '<div class="note">Loading…</div>');
    else if (node.children.length) li.appendChild(renderList(node.children));
  }
  return li;
}

const isFolderish = (n) => n.isFolder !== false && !(n.loaded && !n.children.length);

function walk(nodes, fn) {
  for (const n of nodes) {
    fn(n);
    walk(n.children, fn);
  }
}

function updateLinks() {
  let anyOpen = false;
  walk(roots, (n) => {
    if (isFolderish(n) && n.open) anyOpen = true;
  });
  $('collapseAll').disabled = !anyOpen;
}

function collapseAll() {
  walk(roots, (n) => {
    n.open = false;
  });
  render();
}

// Loads a folder's contents once; concurrent callers share the same request.
function load(node) {
  if (node.loaded) return Promise.resolve();
  if (!node.loadPromise) {
    node.loadPromise = send({ type: 'wlx-list', url: node.url })
      .then((res) => {
        if (!res || !res.ok) throw new Error((res && res.error) || 'Could not load folder');
        node.children = res.children.map((c) => makeNode(c, node));
        node.isFolder = res.kind === 'folder';
        node.loaded = true;
      })
      .catch((e) => {
        node.loadPromise = null;
        node.loadFailed = true;
        throw e;
      });
  }
  return node.loadPromise;
}

// Visible folders whose contents aren't known yet (so we can't tell if they're empty).
function visibleUnloaded(nodes = roots, out = []) {
  for (const n of nodes) {
    if (!n.loaded && !n.loadPromise && !n.loadFailed && n.isFolder !== false) out.push(n);
    if (n.open) visibleUnloaded(n.children, out);
  }
  return out;
}

// Loads visible folders one level ahead in the background, so empty folders never
// show an expand arrow and opening a folder is instant.
let prefetching = false;
async function prefetch() {
  if (prefetching) return;
  prefetching = true;
  try {
    for (let batch = visibleUnloaded(); batch.length; batch = visibleUnloaded()) {
      const queue = [...batch];
      const worker = async () => {
        for (let n = queue.shift(); n; n = queue.shift()) await load(n).catch(() => {});
      };
      await Promise.all([worker(), worker(), worker()]);
      render();
    }
  } finally {
    prefetching = false;
  }
}

async function toggleOpen(node) {
  node.open = !node.open;
  render();
  if (node.open && !node.loaded) {
    try {
      await load(node);
    } catch (e) {
      node.open = false;
      msg(e.message);
    }
    if (!node.children.length) node.open = false; // turned out empty: nothing to show
    render();
  }
}

// Open the folders leading to the page you're on and tick the current one.
async function revealCurrent(info) {
  let level = roots;
  for (const id of info.expandIds) {
    const node = level.find((n) => n.id === id);
    if (!node) return;
    if (id === info.currentId) {
      setChecked(node, true);
      syncParents(node);
      return;
    }
    try {
      await load(node);
    } catch {
      return;
    }
    node.open = true;
    level = node.children;
  }
}

async function init() {
  const saved = await chrome.storage.sync.get(DEFAULTS);
  for (const key of Object.keys(DEFAULTS)) {
    $(key).checked = saved[key];
    $(key).addEventListener('change', () => chrome.storage.sync.set({ [key]: $(key).checked }));
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/weblab\.tudelft\.nl\//.test(tab.url || '')) {
    $('tree').innerHTML = '<div class="note">Open any page of a WebLab course first.</div>';
    return;
  }
  tabId = tab.id;

  let info;
  try {
    info = await send({ type: 'wlx-course' });
  } catch {
    $('tree').innerHTML = '<div class="note">Reload this WebLab page, then open the extension again.</div>';
    return;
  }
  if (!info || !info.ok) {
    $('tree').innerHTML = '<div class="note">Could not read this course\'s folders.</div>';
    msg((info && info.error) || '');
    return;
  }
  if (!info.inCourse) {
    $('tree').innerHTML = '<div class="note">Open a course first: click one of your courses on the WebLab home page, then open this again.</div>';
    $('collapseAll').disabled = true;
    return;
  }
  $('course').textContent = [info.course, info.edition].filter(Boolean).join(' · ');
  if (info.running) msg('A download is already running in this tab.');

  roots.push(...info.top.map((item) => makeNode(item, null)));
  await revealCurrent(info);
  render();
}

// Each ⓘ button shows/hides the panel named in its aria-controls.
for (const button of document.querySelectorAll('.info')) {
  button.addEventListener('click', () => {
    const panel = $(button.getAttribute('aria-controls'));
    const show = panel.hidden;
    panel.hidden = !show;
    button.setAttribute('aria-expanded', String(show));
  });
}

$('collapseAll').addEventListener('click', collapseAll);

$('go').addEventListener('click', async () => {
  const items = selection().map((n) => ({ url: n.url, path: n.path }));
  try {
    const res = await send({ type: 'wlx-start', items, options: { includeMine: $('includeMine').checked, includeImages: $('includeImages').checked } });
    if (res && res.ok) window.close();
    else msg((res && res.error) || 'Could not start.');
  } catch {
    msg('Reload this WebLab page, then try again.');
  }
});

init();
