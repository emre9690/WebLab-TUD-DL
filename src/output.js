// Renders crawled sections into an AI-friendly zip: one combined Markdown file,
// one file per exam/section, images and an index.
var WLX = globalThis.WLX || (globalThis.WLX = {});

(() => {
  const SEP = ' › ';
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const TYPE_LABEL = {
    'multiple-choice': 'Multiple choice',
    open: 'Open question',
    programming: 'Programming',
    other: 'Page',
  };

  function safeName(s, max = 80) {
    return (
      String(s || 'untitled')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/^[.\s]+|[.\s]+$/g, '')
        .slice(0, max) || 'untitled'
    );
  }

  const indent = (s, n) => s.replace(/\n/g, '\n' + ' '.repeat(n));
  const quote = (s) => s.split('\n').map((l) => `> ${l}`).join('\n');

  function letterFor(options, optText) {
    const i = options.findIndex((o) => (typeof o === 'string' ? o : o.text) === optText);
    return i >= 0 ? LETTERS[i] : null;
  }

  // Locked answers are treated exactly like unpublished ones.
  const hasModelAnswer = (node) => !!(node.modelAnswer && node.modelAnswer.status === 'available');
  // Options WebLab marked ✓ after you submitted (shown even if you picked something else).
  const shownCorrect = (node) => (node.options || []).filter((o) => o.feedback === 'correct');

  function answerSource(node) {
    if (hasModelAnswer(node)) return 'model-answer';
    if (shownCorrect(node).length) return 'weblab-feedback';
    return 'none';
  }

  function renderModelAnswer(node) {
    const a = node.modelAnswer;
    if (!hasModelAnswer(node)) {
      const shown = shownCorrect(node);
      if (shown.length) {
        const lines = shown.map((o) => `- ${letterFor(node.options, o.text)}) ${indent(o.text, 5)}`);
        return `**Correct answer (shown by WebLab after submitting):**\n\n${lines.join('\n')}`;
      }
      if (a && a.status === 'error') return `**Model answer:** could not be loaded (${a.error}).`;
      return '**Model answer:** none published.';
    }

    const parts = ['**Model answer (published by course staff):**'];
    if (a.correct) {
      const opts = node.options || a.options || [];
      const lines = a.correct.map((t) => {
        const l = letterFor(opts, t);
        return l ? `- ${l}) ${indent(t, 5)}` : `- ${indent(t, 2)}`;
      });
      parts.push(lines.length ? lines.join('\n') : '- (no option marked correct)');
    }
    for (const f of a.files || []) parts.push(`*${f.name}:*\n\n${fence(f.content, node.language)}`);
    if (a.text) parts.push(a.text);
    return parts.join('\n\n');
  }

  function fence(code, lang) {
    const f = code.includes('```') ? '````' : '```';
    return `${f}${lang || ''}\n${code}\n${f}`;
  }

  function renderMyAnswer(node, opts) {
    if (!opts.includeMine) return '';
    if (node.type === 'multiple-choice' && node.myAnswer && node.myAnswer.length) {
      const picks = node.myAnswer.map((o) => {
        const mark = o.feedback === 'correct' ? ' ✓ (WebLab marked this correct)' : o.feedback === 'wrong' ? ' ✗ (WebLab marked this wrong)' : '';
        return `${letterFor(node.options, o.text) || '?'}${mark}`;
      });
      return `**My answer:** ${picks.join(', ')}`;
    }
    if (node.type === 'open' && node.myAnswer) return `**My answer:**\n\n${quote(node.myAnswer)}`;
    return '';
  }

  function renderQuestion(node, path, opts, level = 3) {
    const out = [`${'#'.repeat(level)} ${path.join(SEP)}`];
    const meta = [TYPE_LABEL[node.type] || 'Question'];
    if (node.type === 'multiple-choice') meta[0] += node.multi ? ' (select all that apply)' : ' (select one)';
    if (node.weight) meta.push(`weight ${node.weight}`);
    meta.push(`[open in WebLab](${node.url})`);
    out.push(`*${meta.join(' · ')}*`);

    if (node.description) out.push(node.description);
    if (node.text) out.push(node.text);

    if (node.type === 'multiple-choice') {
      out.push('**Options:**\n\n' + node.options.map((o, i) => `- ${LETTERS[i]}) ${indent(o.text, 5)}`).join('\n'));
    }
    if (node.type === 'programming') {
      for (const f of node.files || []) {
        if (f.name === 'Solution' && !opts.includeMine) continue;
        if (!f.content.trim()) continue;
        const label = f.name === 'Solution' ? 'Solution file (starter template, plus my code if I wrote any)' : `${f.name} file`;
        out.push(`*${label}:*\n\n${fence(f.content, node.language)}`);
      }
    }

    const mine = renderMyAnswer(node, opts);
    if (mine) out.push(mine);
    out.push(renderModelAnswer(node));
    for (const e of node.explanations || []) out.push(`**${e.title} (from WebLab):**\n\n${e.text}`);
    return out.join('\n\n');
  }

  function renderNode(node, path, opts) {
    if (node.kind === 'error') return `### ${path.join(SEP)}\n\n*Could not download this page (${node.error}). [Open in WebLab](${node.url})*`;
    if (node.kind === 'question') return renderQuestion(node, path, opts);
    const parts = [`## ${path.join(SEP)}`];
    if (node.description) parts.push(node.description);
    for (const child of node.items || []) parts.push(renderNode(child, [...path, child.title], opts));
    return parts.join('\n\n');
  }

  function countQuestions(node) {
    if (node.kind === 'question') return 1;
    return (node.items || []).reduce((n, c) => n + countQuestions(c), 0);
  }

  // units: [{ node, path }] covered by this file; listed as contents when there are several.
  function header(title, opts, units) {
    const date = new Date().toISOString().slice(0, 10);
    const n = units.reduce((sum, u) => sum + countQuestions(u.node), 0);
    const lines = [
      `# ${title}`,
      `Downloaded from TU Delft WebLab on ${date} · ${n} question${n === 1 ? '' : 's'} · my answers: ${opts.includeMine ? 'included' : 'not included'} · model answers: included where the teacher published them`,
      'How to read this file: every heading shows the full WebLab folder path (Folder › Subfolder › Question). Figures are stored in the images/ folder next to this file; each one is referenced by filename where it appears.',
    ];
    if (units.length > 1) {
      lines.push('**Contents:**\n\n' + units.map((u) => `- ${u.path.join(SEP)} (${countQuestions(u.node)} questions)`).join('\n'));
    }
    return lines.join('\n\n');
  }

  function indexEntries(node, path, out = []) {
    if (node.kind === 'question') {
      out.push({
        path: path.join(SEP),
        title: node.title,
        type: node.type,
        weight: node.weight ? Number(node.weight) : null,
        url: node.url,
        correctAnswer: answerSource(node),
      });
    } else if (node.kind === 'error') {
      out.push({ path: path.join(SEP), url: node.url, error: node.error });
    }
    for (const c of node.items || []) indexEntries(c, [...path, c.title], out);
    return out;
  }

  // One file per selected item; a single selected folder is split by its subfolders
  // (e.g. picking "Exam Practice" gives one file per exam).
  function splitUnits(sections) {
    if (sections.length > 1) return sections;
    const only = sections[0];
    const subs = (only.node.items || []).filter((c) => c.kind === 'folder');
    return subs.length > 1 ? subs.map((c) => ({ node: c, path: [...only.path, c.title] })) : [];
  }

  function zipTitle(course, sections) {
    const titles = sections.map((s) => s.path[s.path.length - 1]);
    const what = titles.length <= 2 ? titles.join(' + ') : `${titles[0]} + ${titles.length - 1} more`;
    return course ? `${course} - ${what}` : what;
  }

  // result: { sections: [{ node, path }], images }. Returns { zipName, blob, questionCount }.
  function buildZip(result, opts) {
    const { sections, images } = result;
    const first = sections.find((s) => s.node.course) || sections[0];
    const course = (first && first.node.course) || '';
    const title = zipTitle(course, sections);
    const root = safeName(title);
    const zip = new WLX.ZipWriter();

    const imageFor = new Map(images.map((img) => [img.token, img]));
    const withImages = (md) =>
      md.replace(/@@WLX_IMG_\d+@@/g, (tok) => {
        const img = imageFor.get(tok);
        if (!img) return tok;
        return img.bytes ? `images/${img.file}` : img.url;
      });
    const render = (units) => units.map((u) => renderNode(u.node, u.path, opts)).join('\n\n');
    const add = (name, md) => zip.add(`${root}/${name}`, withImages(md) + '\n');

    add('ALL_CONTENT.md', `${header(title, opts, sections)}\n\n${render(sections)}`);
    for (const u of splitUnits(sections)) {
      const unitTitle = `${course ? course + ' - ' : ''}${u.path[u.path.length - 1]}`;
      add(`${safeName(u.path[u.path.length - 1])}.md`, `${header(unitTitle, opts, [u])}\n\n${render([u])}`);
    }

    for (const img of images) if (img.bytes) zip.add(`${root}/images/${img.file}`, img.bytes);

    const index = {
      source: 'TU Delft WebLab',
      course,
      edition: (first && first.node.edition) || '',
      downloadedAt: new Date().toISOString(),
      includesMyAnswers: !!opts.includeMine,
      selected: sections.map((s) => ({ path: s.path.join(SEP), url: s.node.url })),
      questions: sections.flatMap((s) => indexEntries(s.node, s.path)),
    };
    zip.add(`${root}/index.json`, JSON.stringify(index, null, 2));

    const questionCount = sections.reduce((n, s) => n + countQuestions(s.node), 0);
    return { zipName: `${root}.zip`, blob: zip.toBlob(), questionCount };
  }

  WLX.buildZip = buildZip;
  WLX.renderNode = renderNode;
})();
