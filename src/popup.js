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
  $('reset').disabled = n === 0;
  $('reset').textContent = `Reset answers in ${n} item${n === 1 ? '' : 's'}`;
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
  twisty.disabled = node.isFolder === false;
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
    else li.insertAdjacentHTML('beforeend', '<div class="note">Empty folder</div>');
  }
  return li;
}

const isFolderish = (n) => n.isFolder !== false;

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

// Folder lists are remembered for 30 minutes in Chrome's in-memory session storage
// (cleared when the browser closes), so moving around WebLab and reopening the
// popup doesn't request the same folders again.
const CACHE_MS = 30 * 60 * 1000;

async function listFolder(url) {
  const key = `folder:${url}`;
  try {
    const hit = (await chrome.storage.session.get(key))[key];
    if (hit && Date.now() - hit.t < CACHE_MS) return hit.data;
  } catch {
    // No cache available: just ask WebLab.
  }
  const res = await send({ type: 'wlx-list', url });
  if (!res || !res.ok) throw new Error((res && res.error) || 'Could not load folder');
  const data = { kind: res.kind, children: res.children };
  try {
    await chrome.storage.session.set({ [key]: { t: Date.now(), data } });
  } catch {
    // Caching is only an optimisation.
  }
  return data;
}

// Loads a folder's contents once, only when it's opened; concurrent callers share the request.
function load(node) {
  if (node.loaded) return Promise.resolve();
  if (!node.loadPromise) {
    node.loadPromise = listFolder(node.url)
      .then((res) => {
        node.children = res.children.map((c) => makeNode(c, node));
        node.isFolder = res.kind === 'folder';
        node.loaded = true;
      })
      .catch((e) => {
        node.loadPromise = null;
        throw e;
      });
  }
  return node.loadPromise;
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
    if (node.isFolder === false) node.open = false; // turned out to be a question, not a folder
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

  let top = info.top || [];
  if (info.rootUrl) {
    try {
      top = (await listFolder(info.rootUrl)).children;
    } catch (e) {
      $('tree').innerHTML = '<div class="note">Could not load this course\'s folders.</div>';
      msg(e.message);
      return;
    }
  }
  roots.push(...top.map((item) => makeNode(item, null)));
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

// Resetting erases answers, so it asks first and names exactly what will be reset.
$('reset').addEventListener('click', () => {
  const list = $('confirmList');
  list.textContent = '';
  for (const node of selection()) {
    const li = document.createElement('li');
    li.textContent = node.path.join(' › ') + (node.isFolder === false ? '' : ' (folder)');
    list.appendChild(li);
  }
  $('confirm').hidden = false;
  $('confirmNo').focus();
});

$('confirmNo').addEventListener('click', () => ($('confirm').hidden = true));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('confirm').hidden = true;
});

$('confirmYes').addEventListener('click', async () => {
  $('confirm').hidden = true;
  const items = selection().map((n) => ({ url: n.url, path: n.path, isFolder: n.isFolder }));
  try {
    const res = await send({ type: 'wlx-reset', items });
    if (res && res.ok) window.close();
    else msg((res && res.error) || 'Could not start.');
  } catch {
    msg('Reload this WebLab page, then try again.');
  }
});

init();
