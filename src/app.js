import { Chessground } from 'https://cdn.jsdelivr.net/npm/@lichess-org/chessground@10.1.1/+esm';

const RACING_KINGS_FEN = '8/8/8/8/8/8/krbnNBRK/qrbnNBRQ w - - 0 1';
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

const boardElement = document.querySelector('#board');
const statusElement = document.querySelector('#status');
const resetButton = document.querySelector('#reset');
const flipButton = document.querySelector('#flip');

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
updateBoard('White to move');

function onUserMove(orig, dest) {
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
  board.set({ fen: RACING_KINGS_FEN, orientation: 'white' });
  updateBoard('White to move');
}

function commitMove(orig, dest) {
  const piece = pieces.get(orig);
  pieces.delete(orig);
  pieces.set(dest, piece);
  lastMove = [orig, dest];
}

function updateBoard(message) {
  const movableColor = turnColor === 'white' ? 'white' : undefined;
  const premoveDests = isBlackThinking ? legalDestinations('white') : undefined;

  statusElement.textContent = message;
  board.set({
    fen: piecesToFen(pieces),
    turnColor,
    lastMove,
    check: checkedKingSquare(),
    movable: {
      color: movableColor,
      dests: turnColor === 'white' ? legalDestinations('white') : new Map(),
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

function checkedKingSquare() {
  const whiteKing = findKing('white');
  const blackKing = findKing('black');
  if (whiteKing && isAttacked(whiteKing, 'black', pieces)) return whiteKing;
  if (blackKing && isAttacked(blackKing, 'white', pieces)) return blackKing;
  return undefined;
}

function legalDestinations(color) {
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
