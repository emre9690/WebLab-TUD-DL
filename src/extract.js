// Turns one fetched WebLab page into structured data (folder, question, or other page).
var WLX = globalThis.WLX || (globalThis.WLX = {});

(() => {
  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  function assignmentId(url) {
    const m = String(url).match(/\/assignment\/(\d+)/);
    return m ? m[1] : null;
  }

  function abs(href, baseUrl) {
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return null;
    }
  }

  function infoRow(doc, label) {
    for (const row of doc.querySelectorAll('#assignmenttab tr.infoRow')) {
      if (text(row.querySelector('.infoRowLabel')) === label) {
        const value = row.querySelector('.infoRowValue');
        return value ? text(value.firstChild) || text(value) : '';
      }
    }
    return '';
  }

  // ctx: { onImage(imgEl, baseUrl) -> markdown path }
  function md(el, baseUrl, ctx) {
    return WLX.toMarkdown(el, { baseUrl, onImage: ctx.onImage && ((img) => ctx.onImage(img, baseUrl)) });
  }

  function common(doc, url) {
    const crumbs = Array.from(doc.querySelectorAll('ul.breadcrumb li'));
    const active = doc.querySelector('ul.breadcrumb li.active');
    const courseLink = crumbs
      .map((li) => li.querySelector('a'))
      .find((a) => a && /^https?:\/\/[^/]+\/[^/]+\/?$/.test(a.getAttribute('href') || ''));
    const editionLink = crumbs
      .map((li) => li.querySelector('a'))
      .find((a) => a && /^https?:\/\/[^/]+\/[^/]+\/[^/]+\/?$/.test(a.getAttribute('href') || ''));
    const answerLink = Array.from(doc.querySelectorAll('a[href]')).find((a) =>
      /\/assignment\/\d+\/answer\/?$/.test(a.getAttribute('href'))
    );
    return {
      id: assignmentId(url),
      url,
      title: text(active && active.querySelector('a')) || text(doc.querySelector('title')).replace(/^✎\s*/, ''),
      course: text(courseLink),
      edition: text(editionLink),
      weight: infoRow(doc, 'Weight'),
      answerUrl: answerLink ? abs(answerLink.getAttribute('href'), url) : null,
    };
  }

  function description(doc, url, ctx) {
    const el = doc.querySelector('.assignment-info .assignment-text');
    return el ? md(el, url, ctx) : '';
  }

  function parseFolder(table, url) {
    const children = [];
    for (const a of table.querySelectorAll('tbody a.assignment-link')) {
      const href = abs(a.getAttribute('href'), url);
      if (!href) continue;
      const row = a.closest('tr');
      children.push({
        title: text(a),
        url: href,
        id: assignmentId(href),
        isFolder: !!(row && row.querySelector('.glyphicon-folder-close, .glyphicon-folder-open')),
      });
    }
    return children;
  }

  // Code files of a programming assignment live in hidden textareas, one per tab.
  function codeFiles(doc) {
    const files = [];
    for (const pane of doc.querySelectorAll('.tab-pane[id]')) {
      const ta = pane.querySelector('textarea.inputText');
      if (ta) files.push({ name: pane.id, content: ta.textContent.replace(/\s+$/, '') });
    }
    return files;
  }

  function codeLanguage(doc) {
    const el = doc.querySelector('[class*="language-"]');
    const m = el && el.className.match(/language-([\w+#-]+)/);
    return m ? m[1] : '';
  }

  function parseOptions(footer, url, ctx) {
    const labels = Array.from(footer.querySelectorAll('label.radio, label.checkbox'));
    return labels
      .map((label) => {
        const input = label.querySelector('input');
        const fb = label.querySelector('.mcq-feedback');
        return {
          text: md(label.querySelector('.wikitext') || label, url, ctx),
          checked: !!(input && (input.checked || input.hasAttribute('checked'))),
          feedback: fb && fb.classList.contains('bg-success') ? 'correct' : fb && fb.classList.contains('bg-danger') ? 'wrong' : null,
        };
      })
      .filter((o) => o.text && o.text.toLowerCase() !== 'no answer');
  }

  function parseQuestion(doc, url, base, ctx) {
    const sheet = doc.querySelector('.sheet-content');
    const q = sheet && sheet.querySelector('.question-element');
    const files = codeFiles(doc);
    const out = { ...base, kind: 'question', description: description(doc, url, ctx), text: '' };

    if (q) {
      const title = text(q.querySelector('h3[class*="title-"]'));
      if (title) out.title = title;
      const w = text(q.querySelector('.label')).match(/weight:\s*([\d.]+)/);
      if (w) out.weight = w[1];
      out.text = md(q.querySelector('.panel-body .collapse-pane-content .wikitext'), url, ctx);
    }

    const footer = q && q.querySelector('.panel-footer');
    const options = footer ? parseOptions(footer, url, ctx) : [];
    if (options.length) {
      out.type = 'multiple-choice';
      out.options = options;
      out.multi = /multiple|all that apply/i.test(text(footer.querySelector('.help-block'))) || !!footer.querySelector('label.checkbox');
      out.myAnswer = options.filter((o) => o.checked);
    } else if (files.length) {
      out.type = 'programming';
      out.language = codeLanguage(doc);
      out.files = files;
    } else if (footer && footer.querySelector('textarea.inputWikiText')) {
      out.type = 'open';
      out.myAnswer = footer.querySelector('textarea.inputWikiText').textContent.trim();
    } else {
      out.type = 'other';
    }
    return out;
  }

  function parsePage(doc, url, ctx = {}) {
    const base = common(doc, url);
    const sheet = doc.querySelector('.sheet-content');
    const table = sheet && sheet.querySelector('table.assignment-table');
    if (table) {
      return { ...base, kind: 'folder', description: description(doc, url, ctx), children: parseFolder(table, url) };
    }
    if ((sheet && sheet.querySelector('.question-element')) || codeFiles(doc).length) {
      return parseQuestion(doc, url, base, ctx);
    }
    const body = sheet ? sheet.cloneNode(true) : null;
    if (body) body.querySelectorAll('[id$="-comments"]').forEach((el) => el.remove());
    return { ...base, kind: 'question', type: 'other', description: description(doc, url, ctx), text: md(body, url, ctx) };
  }

  // Parses an /answer page. Never unlocks anything: locked answers are reported as locked.
  function parseAnswer(doc, url, ctx = {}) {
    const sheet = doc.querySelector('.sheet-content');
    if (!sheet) return { status: 'unavailable' };
    const sheetText = text(sheet);
    if (/Answer behind lock/i.test(sheetText) || /remove lock/i.test(sheetText)) return { status: 'locked' };

    const q = parseQuestion(doc, url, common(doc, url), ctx);
    const result = { status: 'available' };
    if (q.type === 'multiple-choice') {
      result.correct = q.options.filter((o) => o.checked).map((o) => o.text);
      result.options = q.options.map((o) => o.text);
    } else if (q.type === 'programming') {
      result.files = q.files;
    } else {
      const footer = sheet.querySelector('.question-element .panel-footer');
      if (footer) {
        const clone = footer.cloneNode(true);
        clone.querySelectorAll('.help-block, .modal, [id^="versions-"]').forEach((el) => el.remove());
        const ta = clone.querySelector('textarea');
        result.text = (ta && ta.textContent.trim()) || md(clone, url, ctx);
      }
    }
    if (!result.correct && !result.files && !result.text) {
      const clone = sheet.cloneNode(true);
      clone.querySelectorAll('[id$="-comments"], .help-block').forEach((el) => el.remove());
      result.text = md(clone, url, ctx);
    }
    return result;
  }

  WLX.assignmentId = assignmentId;
  WLX.parsePage = parsePage;
  WLX.parseAnswer = parseAnswer;
})();
