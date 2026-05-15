import { Chessground } from 'https://cdn.jsdelivr.net/npm/@lichess-org/chessground@10.1.1/+esm';

const RACING_KINGS_FEN = '8/8/8/8/8/8/krbnNBRK/qrbnNBRQ w - - 0 1';
const REPERTOIRE_MANIFEST_URL = 'data/repertoires.json';
const FALLBACK_REPERTOIRE_FILES = ['data/test1.json'];
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const PIECE_NAMES = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const KNIGHT_DELTAS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const KING_DELTAS = [
  [1, 1],
  [1, 0],
  [1, -1],
  [0, 1],
  [0, -1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];
const ORTHOGONAL_DELTAS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL_DELTAS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

let pieces = fenToPieces(RACING_KINGS_FEN);
let turnColor = 'white';
let lastMove = [];
let isBlackThinking = false;
let selectedPlayerColor = 'white';
let playerColor = 'white';
let currentMode = 'board';
let repertoireRoots = [];
let currentRepertoireNodes = [];
let repertoireReady = false;

const BOARD_MODES = {
  repertoire: {
    label: 'Repertoire training',
    title: 'Repertoire Training Board',
    description: 'Drill opening lines, plans, and key positions from a reusable chessboard workspace.',
  },
  survival: {
    label: 'Survival',
    title: 'Survival Board',
    description: 'Solve from the board and keep going until the streak finally breaks.',
  },
  timed: {
    label: 'Timed training',
    title: 'Timed Board',
    description: 'Use the shared board as the foundation for fast, clock-pressure tactical sets.',
  },
  chapter: {
    label: 'Chapter training',
    title: 'Chapter Board',
    description: 'Progress through curated lessons and milestones with a board ready for each position.',
  },
  weakness: {
    label: 'Weakness review',
    title: 'Weakness Board',
    description: 'Review recurring mistakes and future adaptive exercises from this chessboard.',
  },
  flashcards: {
    label: 'Flashcards',
    title: 'Flashcards Board',
    description: 'Pair memorization cards with a visual board for motifs, endgames, and repertoire notes.',
  },
};

const boardElement = document.querySelector('#board');
const statusElement = document.querySelector('#status');
const resetButton = document.querySelector('#reset');
const flipButton = document.querySelector('#flip');
const colorSelect = document.querySelector('#training-color');
const colorControl = document.querySelector('#color-control');
const repertoireDetailsElement = document.querySelector('#repertoire-details');

initializeModeContent();

if (!boardElement || !statusElement || !resetButton || !flipButton || !colorSelect || !colorControl || !repertoireDetailsElement) {
  throw new Error('Training board markup is missing required elements.');
}

const board = Chessground(boardElement, {
  fen: RACING_KINGS_FEN,
  orientation: 'white',
  coordinates: true,
  turnColor,
  highlight: {
    lastMove: true,
    check: true,
  },
  animation: {
    enabled: true,
    duration: 180,
  },
  movable: {
    color: 'white',
    free: false,
    showDests: true,
    dests: legalDestinations('white'),
    events: {
      after: onUserMove,
    },
  },
  premovable: {
    enabled: true,
    showDests: true,
    castle: false,
  },
  draggable: {
    enabled: true,
    showGhost: true,
  },
  drawable: {
    enabled: true,
    visible: true,
    defaultSnapToValidMove: true,
  },
});

resetButton.addEventListener('click', resetGame);
flipButton.addEventListener('click', () => board.toggleOrientation());
colorSelect.addEventListener('change', () => {
  selectedPlayerColor = colorSelect.value;
  resetGame();
});

initializeTraining();

function initializeModeContent() {
  const mode = new URLSearchParams(window.location.search).get('mode');
  currentMode = mode || 'board';
  const content = BOARD_MODES[mode] || {
    label: 'Training board',
    title: 'Chessboard workspace',
    description: 'Use this shared board as the starting workspace for your selected training mode.',
  };

  document.title = `${content.title} | Chess Trainer`;
  document.querySelector('#mode-label').textContent = content.label;
  document.querySelector('#mode-title').textContent = content.title;
  document.querySelector('#mode-description').textContent = content.description;
  colorControl.hidden = mode !== 'repertoire';
}

function onUserMove(orig, dest) {
  if (isRepertoireMode()) {
    onRepertoireUserMove(orig, dest);
    return;
  }

  if (turnColor !== 'white' || isBlackThinking) return;
  commitMove(orig, dest);
  const result = resultMessage();
  if (result) {
    updateBoard(result);
    return;
  }
  turnColor = 'black';
  isBlackThinking = true;
  updateBoard('Black to move — set a premove if you like');
  window.setTimeout(playBlackMove, 650);
}

function playBlackMove() {
  const options = allLegalMoves('black');
  if (!options.length) {
    turnColor = 'white';
    isBlackThinking = false;
    updateBoard('Black has no legal move. White to move');
    return;
  }

  const move = chooseRacingMove(options);
  commitMove(move.orig, move.dest);
  turnColor = 'white';
  isBlackThinking = false;
  updateBoard(resultMessage() || 'White to move');

  if (typeof board.playPremove === 'function' && board.playPremove()) {
    window.setTimeout(() => {
      turnColor = 'black';
      isBlackThinking = true;
      updateBoard('Black to move — premove played');
      window.setTimeout(playBlackMove, 650);
    }, 180);
  }
}

function chooseRacingMove(moves) {
  const scored = moves.map(move => {
    const piece = pieces.get(move.orig);
    const fromRank = Number(move.orig[1]);
    const toRank = Number(move.dest[1]);
    const captureBonus = pieces.has(move.dest) ? 1.5 : 0;
    const kingRaceBonus = piece.role === 'king' ? (toRank - fromRank) * 4 : toRank * 0.15;
    return { move, score: captureBonus + kingRaceBonus + Math.random() };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}

function resetGame() {
  pieces = fenToPieces(RACING_KINGS_FEN);
  turnColor = 'white';
  lastMove = [];
  isBlackThinking = false;
  currentRepertoireNodes = repertoireRoots.map(root => root.tree);

  const orientation = isRepertoireMode() ? resolvePlayerColor() : 'white';
  board.set({ fen: RACING_KINGS_FEN, orientation });

  if (isRepertoireMode()) {
    if (!repertoireReady) {
      updateBoard('Loading repertoire JSON files…');
      return;
    }
    startRepertoireTurn('Practice reset.');
    return;
  }

  updateBoard('White to move');
}

function commitMove(orig, dest) {
  const piece = pieces.get(orig);
  pieces.delete(orig);
  pieces.set(dest, piece);
  lastMove = [orig, dest];
}

function updateBoard(message) {
  const movableColor = isRepertoireMode()
    ? turnColor === playerColor && !isBlackThinking && repertoireReady
      ? playerColor
      : undefined
    : turnColor === 'white'
      ? 'white'
      : undefined;
  const premoveDests = !isRepertoireMode() && isBlackThinking ? legalDestinations('white') : undefined;

  statusElement.textContent = message;
  board.set({
    fen: piecesToFen(pieces),
    turnColor,
    lastMove,
    check: checkedKingSquare(),
    movable: {
      color: movableColor,
      dests: movableColor ? legalDestinations(movableColor) : new Map(),
      showDests: true,
    },
    premovable: {
      enabled: true,
      showDests: true,
      dests: premoveDests,
    },
  });
}

function resultMessage() {
  const whiteKing = findKing('white');
  const blackKing = findKing('black');
  if (whiteKing?.endsWith('8') && blackKing?.endsWith('8')) return 'Both kings reached rank 8 — draw';
  if (blackKing?.endsWith('8')) return 'Black wins the race';
  if (whiteKing?.endsWith('8')) return 'White reached rank 8 — Black gets one reply to tie';
  return '';
}


async function initializeTraining() {
  if (!isRepertoireMode()) {
    repertoireDetailsElement.textContent = 'Free board mode: use the legal move hints to explore the current position.';
    resetGame();
    return;
  }

  updateBoard('Loading repertoire JSON files…');
  try {
    repertoireRoots = await loadRepertoireRoots();
    repertoireReady = repertoireRoots.length > 0;
    repertoireDetailsElement.textContent = repertoireReady
      ? `Loaded ${repertoireRoots.length} repertoire chapter${repertoireRoots.length === 1 ? '' : 's'} from JSON.`
      : 'No playable repertoire chapters were found in the JSON files.';
  } catch (error) {
    repertoireReady = false;
    repertoireDetailsElement.textContent = `Could not load repertoire JSON: ${error.message}`;
  }

  resetGame();
}

async function loadRepertoireRoots() {
  const files = await loadRepertoireFileList();
  const repertoires = await Promise.all(
    files.map(async file => {
      const response = await fetch(file, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`${file} returned ${response.status}`);
      return { file, data: await response.json() };
    }),
  );

  return repertoires.flatMap(({ file, data }) =>
    (data.chapters || [])
      .filter(chapter => chapter.moveTree?.nodes?.length)
      .filter(chapter => boardPart(chapter.initialFen || chapter.moveTree.startingFen) === boardPart(RACING_KINGS_FEN))
      .map(chapter => ({
        file,
        repertoireName: data.name || file,
        chapterName: chapter.name || chapter.id || 'Untitled chapter',
        tree: chapter.moveTree,
      })),
  );
}

async function loadRepertoireFileList() {
  const githubFiles = await loadGitHubDataFiles();
  if (githubFiles.length) return githubFiles;

  try {
    const response = await fetch(REPERTOIRE_MANIFEST_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`manifest returned ${response.status}`);
    const manifest = await response.json();
    if (Array.isArray(manifest.files) && manifest.files.length) return manifest.files;
  } catch (error) {
    console.warn('Falling back to bundled repertoire files:', error);
  }
  return FALLBACK_REPERTOIRE_FILES;
}

async function loadGitHubDataFiles() {
  const repo = githubPagesRepository();
  if (!repo) return [];

  try {
    const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/contents/data`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const entries = await response.json();
    if (!Array.isArray(entries)) return [];
    return entries
      .filter(entry => entry.type === 'file' && entry.name.endsWith('.json') && entry.name !== 'repertoires.json')
      .map(entry => `data/${entry.name}`);
  } catch (error) {
    console.warn('Could not discover GitHub data files:', error);
    return [];
  }
}

function githubPagesRepository() {
  const { hostname, pathname } = window.location;
  if (!hostname.endsWith('.github.io')) return null;

  const owner = hostname.replace(/\.github\.io$/, '');
  const firstPathSegment = pathname.split('/').filter(Boolean)[0];
  return {
    owner,
    name: firstPathSegment || `${owner}.github.io`,
  };
}

function isRepertoireMode() {
  return currentMode === 'repertoire';
}

function resolvePlayerColor() {
  selectedPlayerColor = colorSelect.value;
  playerColor = selectedPlayerColor === 'random' ? randomChoice(['white', 'black']) : selectedPlayerColor;
  return playerColor;
}

function startRepertoireTurn(prefix = '') {
  if (!repertoireReady) {
    updateBoard('No repertoire JSON is available yet.');
    return;
  }

  const availableMoves = repertoireMovesForTurn();
  if (!availableMoves.length) {
    updateBoard(`${prefix ? `${prefix} ` : ''}Practice complete — there are no more opening moves in the JSON.`.trim());
    return;
  }

  if (turnColor === playerColor) {
    const colorNote = selectedPlayerColor === 'random' ? ` Random selected ${playerColor}.` : '';
    updateBoard(`${prefix ? `${prefix} ` : ''}${capitalize(playerColor)} to move — play a repertoire move.${colorNote}`);
    return;
  }

  isBlackThinking = true;
  updateBoard(`${prefix ? `${prefix} ` : ''}${capitalize(turnColor)} is choosing a JSON line…`);
  window.setTimeout(playRepertoireComputerMove, 500);
}

function onRepertoireUserMove(orig, dest) {
  if (!repertoireReady || turnColor !== playerColor || isBlackThinking) return;

  const match = findMatchingRepertoireMove(orig, dest);
  if (!match) {
    lastMove = [];
    updateBoard('That move is not an opening move in the JSON. Try one of the highlighted repertoire moves.');
    return;
  }

  playRepertoireMove(match, `${capitalize(playerColor)} played ${match.node.san}.`);
}

function playRepertoireComputerMove() {
  const options = repertoireMovesForTurn();
  isBlackThinking = false;
  if (!options.length) {
    updateBoard('Practice complete — there are no more opening moves in the JSON.');
    return;
  }

  const move = randomChoice(options);
  playRepertoireMove(move, `${capitalize(turnColor)} selected ${move.node.san} from the JSON.`);
}

function playRepertoireMove(match, message) {
  commitMove(match.move.orig, match.move.dest);
  currentRepertoireNodes = match.nextNodes;
  turnColor = opposite(turnColor);
  startRepertoireTurn(message);
}

function repertoireMovesForTurn() {
  const children = currentRepertoireNodes.flatMap(node => node.nodes || node.children || []);
  const moves = [];

  for (const child of children) {
    const move = moveForSan(child.san, turnColor);
    if (!move) continue;
    moves.push({
      node: child,
      move,
      nextNodes: children.filter(candidate => candidate.san === child.san),
    });
  }

  return dedupeRepertoireMoves(moves);
}

function findMatchingRepertoireMove(orig, dest) {
  return repertoireMovesForTurn().find(option => option.move.orig === orig && option.move.dest === dest);
}

function repertoireDestinations(color) {
  const dests = new Map();
  if (color !== turnColor) return dests;

  for (const option of repertoireMovesForTurn()) {
    if (!dests.has(option.move.orig)) dests.set(option.move.orig, []);
    dests.get(option.move.orig).push(option.move.dest);
  }
  return dests;
}

function moveForSan(san, color) {
  const normalized = normalizeSan(san);
  return allLegalMoves(color).find(move => moveToSan(move, color) === normalized);
}

function moveToSan(move, color) {
  const piece = pieces.get(move.orig);
  if (!piece) return '';

  const capture = pieces.has(move.dest);
  const suffixless = `${pieceLetter(piece)}${disambiguation(move, piece, color)}${capture ? 'x' : ''}${move.dest}`;
  return suffixless;
}

function disambiguation(move, piece, color) {
  if (piece.role === 'pawn' || piece.role === 'king') return '';

  const samePieceMoves = allLegalMoves(color).filter(candidate => {
    if (candidate.orig === move.orig || candidate.dest !== move.dest) return false;
    const candidatePiece = pieces.get(candidate.orig);
    return candidatePiece?.role === piece.role;
  });
  if (!samePieceMoves.length) return '';

  const [moveFile, moveRank] = squareToCoords(move.orig);
  const sameFile = samePieceMoves.some(candidate => squareToCoords(candidate.orig)[0] === moveFile);
  const sameRank = samePieceMoves.some(candidate => squareToCoords(candidate.orig)[1] === moveRank);

  if (!sameFile) return move.orig[0];
  if (!sameRank) return move.orig[1];
  return move.orig;
}

function pieceLetter(piece) {
  if (piece.role === 'pawn') return '';
  return Object.entries(PIECE_NAMES).find(([, role]) => role === piece.role)[0].toUpperCase();
}

function normalizeSan(san) {
  return san.replace(/[+#?!]+/g, '').replace(/=([QRBN])/g, '$1');
}

function dedupeRepertoireMoves(moves) {
  const bySanAndMove = new Map();
  for (const option of moves) {
    const key = `${option.node.san}:${option.move.orig}${option.move.dest}`;
    const existing = bySanAndMove.get(key);
    if (existing) existing.nextNodes.push(...option.nextNodes);
    else bySanAndMove.set(key, { ...option, nextNodes: [...option.nextNodes] });
  }
  return [...bySanAndMove.values()];
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function boardPart(fen) {
  return (fen || '').split(' ')[0];
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function checkedKingSquare() {
  const whiteKing = findKing('white');
  const blackKing = findKing('black');
  if (whiteKing && isAttacked(whiteKing, 'black', pieces)) return whiteKing;
  if (blackKing && isAttacked(blackKing, 'white', pieces)) return blackKing;
  return undefined;
}

function legalDestinations(color) {
  if (isRepertoireMode() && repertoireReady) return repertoireDestinations(color);

  const dests = new Map();
  for (const move of allLegalMoves(color)) {
    if (!dests.has(move.orig)) dests.set(move.orig, []);
    dests.get(move.orig).push(move.dest);
  }
  return dests;
}

function allLegalMoves(color) {
  const moves = [];
  for (const [orig, piece] of pieces) {
    if (piece.color !== color) continue;
    for (const dest of pseudoLegalDests(orig, pieces)) {
      if (isLegalRacingKingsMove(orig, dest, color)) moves.push({ orig, dest });
    }
  }
  return moves;
}

function isLegalRacingKingsMove(orig, dest, color) {
  const nextPieces = new Map(pieces);
  const movingPiece = nextPieces.get(orig);
  const targetPiece = nextPieces.get(dest);
  if (!movingPiece || targetPiece?.color === color) return false;

  nextPieces.delete(orig);
  nextPieces.set(dest, movingPiece);

  const opponent = opposite(color);
  const ownKing = findKing(color, nextPieces);
  const enemyKing = findKing(opponent, nextPieces);

  return Boolean(
    ownKing &&
      enemyKing &&
      !isAttacked(ownKing, opponent, nextPieces) &&
      !isAttacked(enemyKing, color, nextPieces),
  );
}

function pseudoLegalDests(square, position) {
  const piece = position.get(square);
  if (!piece) return [];
  if (piece.role === 'knight') return steppingDests(square, KNIGHT_DELTAS, piece.color, position);
  if (piece.role === 'king') return steppingDests(square, KING_DELTAS, piece.color, position);
  if (piece.role === 'bishop') return slidingDests(square, DIAGONAL_DELTAS, piece.color, position);
  if (piece.role === 'rook') return slidingDests(square, ORTHOGONAL_DELTAS, piece.color, position);
  if (piece.role === 'queen') return slidingDests(square, [...ORTHOGONAL_DELTAS, ...DIAGONAL_DELTAS], piece.color, position);
  return pawnDests(square, piece.color, position);
}

function steppingDests(square, deltas, color, position) {
  const [file, rank] = squareToCoords(square);
  return deltas
    .map(([df, dr]) => coordsToSquare(file + df, rank + dr))
    .filter(dest => dest && position.get(dest)?.color !== color);
}

function slidingDests(square, deltas, color, position) {
  const [file, rank] = squareToCoords(square);
  const dests = [];

  for (const [df, dr] of deltas) {
    let nextFile = file + df;
    let nextRank = rank + dr;
    while (onBoard(nextFile, nextRank)) {
      const dest = coordsToSquare(nextFile, nextRank);
      const occupant = position.get(dest);
      if (!occupant) {
        dests.push(dest);
      } else {
        if (occupant.color !== color) dests.push(dest);
        break;
      }
      nextFile += df;
      nextRank += dr;
    }
  }

  return dests;
}

function pawnDests(square, color, position) {
  const [file, rank] = squareToCoords(square);
  const direction = color === 'white' ? 1 : -1;
  const dests = [];
  const oneStep = coordsToSquare(file, rank + direction);
  if (oneStep && !position.has(oneStep)) dests.push(oneStep);
  for (const df of [-1, 1]) {
    const capture = coordsToSquare(file + df, rank + direction);
    if (capture && position.get(capture)?.color === opposite(color)) dests.push(capture);
  }
  return dests;
}

function isAttacked(square, byColor, position) {
  for (const [attackerSquare, piece] of position) {
    if (piece.color !== byColor) continue;
    if (attacksSquare(attackerSquare, square, piece, position)) return true;
  }
  return false;
}

function attacksSquare(from, target, piece, position) {
  const [fromFile, fromRank] = squareToCoords(from);
  const [targetFile, targetRank] = squareToCoords(target);
  const df = targetFile - fromFile;
  const dr = targetRank - fromRank;

  if (piece.role === 'knight') return KNIGHT_DELTAS.some(([f, r]) => f === df && r === dr);
  if (piece.role === 'king') return Math.max(Math.abs(df), Math.abs(dr)) === 1;
  if (piece.role === 'pawn') {
    const direction = piece.color === 'white' ? 1 : -1;
    return dr === direction && Math.abs(df) === 1;
  }
  if (piece.role === 'bishop') return Math.abs(df) === Math.abs(dr) && clearPath(from, target, position);
  if (piece.role === 'rook') return (df === 0 || dr === 0) && clearPath(from, target, position);
  if (piece.role === 'queen') {
    return (df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr)) && clearPath(from, target, position);
  }
  return false;
}

function clearPath(from, target, position) {
  const [fromFile, fromRank] = squareToCoords(from);
  const [targetFile, targetRank] = squareToCoords(target);
  const stepFile = Math.sign(targetFile - fromFile);
  const stepRank = Math.sign(targetRank - fromRank);
  let file = fromFile + stepFile;
  let rank = fromRank + stepRank;

  while (file !== targetFile || rank !== targetRank) {
    if (position.has(coordsToSquare(file, rank))) return false;
    file += stepFile;
    rank += stepRank;
  }
  return true;
}

function findKing(color, position = pieces) {
  for (const [square, piece] of position) {
    if (piece.color === color && piece.role === 'king') return square;
  }
  return undefined;
}

function fenToPieces(fen) {
  const boardFen = fen.split(' ')[0];
  const nextPieces = new Map();
  boardFen.split('/').forEach((row, rowIndex) => {
    let fileIndex = 0;
    const rank = 8 - rowIndex;
    for (const token of row) {
      if (Number.isInteger(Number(token))) {
        fileIndex += Number(token);
      } else {
        const color = token === token.toUpperCase() ? 'white' : 'black';
        nextPieces.set(`${FILES[fileIndex]}${rank}`, {
          color,
          role: PIECE_NAMES[token.toLowerCase()],
        });
        fileIndex += 1;
      }
    }
  });
  return nextPieces;
}

function piecesToFen(position) {
  const rows = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = position.get(`${FILES[file]}${rank}`);
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      const letter = Object.entries(PIECE_NAMES).find(([, name]) => name === piece.role)[0];
      row += piece.color === 'white' ? letter.toUpperCase() : letter;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${turnColor[0]} - - 0 1`;
}

function squareToCoords(square) {
  return [FILES.indexOf(square[0]), RANKS.indexOf(square[1])];
}

function coordsToSquare(file, rank) {
  return onBoard(file, rank) ? `${FILES[file]}${RANKS[rank]}` : undefined;
}

function onBoard(file, rank) {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function opposite(color) {
  return color === 'white' ? 'black' : 'white';
}
