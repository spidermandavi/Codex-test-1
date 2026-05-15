const LICHESS_STUDY_REGEX = /lichess\.org\/study\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?/;
const STARTING_FEN = 'startpos';
const EXAMPLE_PGN = `[Event "Italian with sidelines"]
[Site "https://lichess.org/study/example/italian"]
[ChapterName "Main chapter"]
[White "Study author"]
[Black "Trainer"]
[Result "*"]

1. e4 {Take the center.} e5 2. Nf3 (2. Bc4 {Bishop's Opening idea.} Nf6) 2... Nc6 3. Bc4 {Italian Game.} (3. Bb5 a6) 3... Bc5 *`;

const studyUrlInput = document.querySelector('#study-url');
const pgnInput = document.querySelector('#study-pgn');
const nameInput = document.querySelector('#repertoire-name');
const form = document.querySelector('#converter-form');
const fetchButton = document.querySelector('#fetch-study');
const exampleButton = document.querySelector('#load-example');
const copyButton = document.querySelector('#copy-json');
const downloadButton = document.querySelector('#download-json');
const statusElement = document.querySelector('#converter-status');
const outputElement = document.querySelector('#json-output');

let latestJson = '';

fetchButton.addEventListener('click', fetchStudyPgn);
exampleButton.addEventListener('click', loadExample);
copyButton.addEventListener('click', copyJson);
downloadButton.addEventListener('click', downloadJson);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  convertStudy();
});

function loadExample() {
  studyUrlInput.value = 'https://lichess.org/study/example/italian';
  pgnInput.value = EXAMPLE_PGN;
  setStatus('Example PGN loaded. Click Convert to JSON.', 'success');
}

async function fetchStudyPgn() {
  const url = studyUrlInput.value.trim();
  const study = parseStudyUrl(url);
  if (!study) {
    setStatus('Paste a valid Lichess study URL first.', 'error');
    return;
  }

  const exportUrl = `https://lichess.org/study/${study.studyId}.pgn?comments=true&variations=true&clocks=false&opening=false`;
  setStatus('Fetching PGN from Lichess…', 'info');
  fetchButton.disabled = true;

  try {
    const response = await fetch(exportUrl, { headers: { Accept: 'application/x-chess-pgn,text/plain' } });
    if (!response.ok) throw new Error(`Lichess returned ${response.status}`);
    pgnInput.value = await response.text();
    setStatus('PGN fetched. Review it, then convert to JSON.', 'success');
  } catch (error) {
    setStatus(
      `Could not fetch automatically (${error.message}). Use Lichess export/copy PGN and paste it below.`,
      'error',
    );
  } finally {
    fetchButton.disabled = false;
  }
}

function convertStudy() {
  try {
    const pgn = pgnInput.value.trim();
    if (!pgn) {
      setStatus('Paste PGN or fetch a study before converting.', 'error');
      return;
    }

    const study = parseStudyUrl(studyUrlInput.value.trim());
    const chapters = splitPgnChapters(pgn).map((chapterPgn, index) => parseChapter(chapterPgn, index));
    const repertoire = {
      schemaVersion: 1,
      type: 'lichess-study-repertoire',
      name: nameInput.value.trim() || 'Imported Lichess Study',
      generatedAt: new Date().toISOString(),
      mergeStrategy: {
        key: 'chapters[].moveTree.nodes[].path',
        description: 'Merge future files by matching each node path from the same starting FEN.',
      },
      source: {
        provider: 'lichess',
        url: studyUrlInput.value.trim() || null,
        studyId: study?.studyId ?? null,
        chapterId: study?.chapterId ?? null,
      },
      chapters,
    };

    latestJson = `${JSON.stringify(repertoire, null, 2)}\n`;
    outputElement.textContent = latestJson;
    setStatus(`Converted ${chapters.length} chapter${chapters.length === 1 ? '' : 's'} to JSON.`, 'success');
  } catch (error) {
    latestJson = '';
    outputElement.textContent = 'Conversion failed. Fix the PGN and try again.';
    setStatus(error.message, 'error');
  }
}

function parseStudyUrl(url) {
  const match = url.match(LICHESS_STUDY_REGEX);
  if (!match) return null;
  return { studyId: match[1], chapterId: match[2] ?? null };
}

function splitPgnChapters(pgn) {
  return pgn
    .replace(/\r\n/g, '\n')
    .split(/\n(?=\[Event\s+")/g)
    .map(chapter => chapter.trim())
    .filter(Boolean);
}

function parseChapter(chapterPgn, index) {
  const { tags, movesText } = readPgnTags(chapterPgn);
  const tokens = tokenizeMovetext(movesText);
  const root = createRootNode(tags);
  const cursor = parseSequence(tokens, 0, root, []);

  if (cursor.index < tokens.length) {
    throw new Error(`Unexpected token near "${tokens[cursor.index]}" in chapter ${index + 1}.`);
  }

  return {
    id: slugify(tags.ChapterName || tags.Event || `chapter-${index + 1}`),
    name: tags.ChapterName || tags.Event || `Chapter ${index + 1}`,
    index,
    tags,
    initialFen: tags.FEN || STARTING_FEN,
    moveTree: root,
  };
}

function readPgnTags(pgn) {
  const tags = {};
  const tagRegex = /^\[([^\s]+)\s+"((?:\\"|[^"])*)"\]\s*$/gm;
  let match;
  let lastTagEnd = 0;

  while ((match = tagRegex.exec(pgn)) !== null) {
    tags[match[1]] = match[2].replace(/\\"/g, '"');
    lastTagEnd = tagRegex.lastIndex;
  }

  return { tags, movesText: pgn.slice(lastTagEnd).trim() };
}

function tokenizeMovetext(text) {
  const withoutLineComments = text.replace(/;[^\n]*/g, ' ');
  const tokens = [];
  let index = 0;

  while (index < withoutLineComments.length) {
    const char = withoutLineComments[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '{') {
      const end = withoutLineComments.indexOf('}', index + 1);
      if (end === -1) throw new Error('Found an unclosed PGN comment.');
      tokens.push(withoutLineComments.slice(index, end + 1));
      index = end + 1;
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push(char);
      index += 1;
      continue;
    }

    const next = withoutLineComments.slice(index).search(/[\s{}()]/);
    const end = next === -1 ? withoutLineComments.length : index + next;
    tokens.push(withoutLineComments.slice(index, end));
    index = end;
  }

  return tokens.filter(token => !isMoveNumber(token));
}

function parseSequence(tokens, startIndex, parent, path) {
  let index = startIndex;
  let currentParent = parent;
  let currentPath = [...path];
  let lastMoveNode = null;
  let variationParent = parent;
  let variationPath = [...path];

  while (index < tokens.length) {
    const token = tokens[index];

    if (token === ')') return { index: index + 1, parent: currentParent, path: currentPath };

    if (token === '(') {
      const parsedVariation = parseSequence(tokens, index + 1, variationParent, variationPath);
      index = parsedVariation.index;
      continue;
    }

    if (isGameResult(token)) {
      index += 1;
      continue;
    }

    if (isComment(token)) {
      if (lastMoveNode) lastMoveNode.comments.push(cleanComment(token));
      else parent.startingComments.push(cleanComment(token));
      index += 1;
      continue;
    }

    if (isNag(token)) {
      if (lastMoveNode) lastMoveNode.nags.push(token);
      index += 1;
      continue;
    }

    const san = normalizeSan(token);
    const beforeMoveParent = currentParent;
    const beforeMovePath = [...currentPath];
    const nextPath = [...currentPath, san];
    const moveNode = findOrCreateMove(currentParent, san, nextPath);
    currentParent = moveNode;
    currentPath = nextPath;
    lastMoveNode = moveNode;
    variationParent = beforeMoveParent;
    variationPath = beforeMovePath;
    index += 1;
  }

  return { index, parent: currentParent, path: currentPath };
}

function createRootNode(tags) {
  return {
    startingFen: tags.FEN || STARTING_FEN,
    startingComments: [],
    nodes: [],
  };
}

function findOrCreateMove(parent, san, path) {
  const children = parent.nodes ?? parent.children;
  const existing = children.find(node => node.san === san);
  if (existing) return existing;

  const node = {
    id: stableNodeId(path),
    san,
    path,
    comments: [],
    nags: [],
    children: [],
  };
  children.push(node);
  return node;
}

function isMoveNumber(token) {
  return /^\d+\.(?:\.\.)?$/.test(token) || /^\d+\.\.\.$/.test(token);
}

function isGameResult(token) {
  return ['1-0', '0-1', '1/2-1/2', '*'].includes(token);
}

function isComment(token) {
  return token.startsWith('{') && token.endsWith('}');
}

function isNag(token) {
  return /^\$\d+$/.test(token) || /^[!?]{1,2}$/.test(token);
}

function cleanComment(token) {
  return token.slice(1, -1).replace(/\s+/g, ' ').trim();
}

function normalizeSan(token) {
  return token.replace(/[!?]+$/g, '').trim();
}

function stableNodeId(path) {
  return `line-${path.map(slugify).join('-')}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/0-0-0/g, 'ooo')
    .replace(/0-0/g, 'oo')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}

async function copyJson() {
  if (!latestJson) {
    setStatus('Convert a study before copying.', 'error');
    return;
  }

  await navigator.clipboard.writeText(latestJson);
  setStatus('JSON copied to your clipboard.', 'success');
}

function downloadJson() {
  if (!latestJson) {
    setStatus('Convert a study before downloading.', 'error');
    return;
  }

  const blob = new Blob([latestJson], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${slugify(nameInput.value || 'lichess-study')}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function setStatus(message, type) {
  statusElement.textContent = message;
  statusElement.dataset.type = type;
}
