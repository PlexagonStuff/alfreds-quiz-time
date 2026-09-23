/*
 * Quizly server
 *
 * Socket contract:
 * host:create-game({ quiz }) -> host:game-created({ code, game })
 * player:join-game({ code, name }) -> player:joined({ player, game })
 * host:start-game() -> game:countdown, game:question, game:reveal, game:leaderboard
 * player:answer({ answerIndex }) -> player:answer-confirmed({ answered, answeredCount, totalPlayers })
 * game:reveal({ correctIndexes, answerCounts, answeredCount, totalPlayers }) is sent when
 * every connected player answers or the question timer ends. It is followed automatically
 * by game:leaderboard after REVEAL_MS.
 * host:next() -> advances reveal / leaderboard / next question
 * host:end-game() -> game:ended
 * Any rejected request emits app:error({ message }).
 */
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3000;
const ROUND_COUNTDOWN_MS = 3000;
// Give the host's spoken welcome room to land before question one is visible.
// This phase deliberately locks answers for every participant.
const INTRODUCTION_MS = 8500;
const REVEAL_MS = 3500;
const LEADERBOARD_MS = 6500;
const games = new Map();

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.status(200).json({ ok: true, games: games.size }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ['GET', 'POST'] } });

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validateQuiz(input) {
  const errors = [];
  const rawQuestions = Array.isArray(input?.questions) ? input.questions : [];
  if (!rawQuestions.length) errors.push('A quiz needs at least one question.');
  const questions = rawQuestions.map((raw, questionIndex) => {
    const title = cleanText(raw?.title ?? raw?.question, 500);
    const timeLimit = Number(raw?.timeLimit ?? raw?.timeLimitSeconds ?? 20);
    const rawAnswers = Array.isArray(raw?.answers) ? raw.answers : [];
    const answers = rawAnswers.map((answer) => ({
      text: cleanText(typeof answer === 'string' ? answer : answer?.text, 300),
      correct: Boolean(typeof answer === 'object' && (answer?.correct ?? answer?.isCorrect))
    })).filter((answer) => answer.text);
    if (!title) errors.push(`Question ${questionIndex + 1} needs a title.`);
    if (!Number.isFinite(timeLimit) || timeLimit < 5 || timeLimit > 300) errors.push(`Question ${questionIndex + 1} needs a time limit from 5 to 300 seconds.`);
    if (answers.length < 2) errors.push(`Question ${questionIndex + 1} needs at least two answers.`);
    if (!answers.some((answer) => answer.correct)) errors.push(`Question ${questionIndex + 1} needs a correct answer.`);
    return { id: `q${questionIndex + 1}`, title, image: cleanText(raw?.image, 2_000_000), timeLimit: Math.round(timeLimit), answers };
  });
  return { valid: errors.length === 0, errors, quiz: { title: cleanText(input?.title, 200) || 'Untitled quiz', questions } };
}

function publicQuestion(question) {
  return { id: question.id, title: question.title, image: question.image, timeLimit: question.timeLimit, answers: question.answers.map((answer, index) => ({ index, text: answer.text })) };
}

function leaderboard(game) {
  return [...game.players.values()].sort((a, b) => b.score - a.score || b.streak - a.streak || a.name.localeCompare(b.name)).map((player, index) => ({ id: player.id, name: player.name, score: player.score, streak: player.streak, rank: index + 1 }));
}

function publicGame(game) {
  return { code: game.code, phase: game.phase, title: game.quiz.title, playerCount: game.players.size, questionIndex: game.questionIndex, questionCount: game.quiz.questions.length };
}

function uniqueCode() {
  let code;
  do code = String(Math.floor(100000 + Math.random() * 900000)); while (games.has(code));
  return code;
}

function clearTimers(game) { for (const timer of game.timers) clearTimeout(timer); game.timers = []; }
function schedule(game, fn, delay) { const timer = setTimeout(fn, delay); game.timers.push(timer); return timer; }
function getGame(socket) { return socket.data.gameCode ? games.get(socket.data.gameCode) : undefined; }
function emitLobby(game) { io.to(game.code).emit('game:lobby', { game: publicGame(game), players: leaderboard(game) }); }

// Keep the expected respondents for a round separately from the mutable lobby.
// This makes the "everyone has answered" check deterministic even if a browser
// disconnects while an answer is being processed.  It also gives the reveal
// chart one authoritative source for its denominator and response totals.
function activeRoundPlayerCount(game) {
  return game.roundPlayerIds ? game.roundPlayerIds.size : game.players.size;
}

function everyoneHasAnswered(game) {
  const expected = activeRoundPlayerCount(game);
  return expected > 0 && game.answers.size >= expected;
}

function calculateAnswerCounts(game, question) {
  const counts = Array.from({ length: question.answers.length }, () => 0);
  for (const response of game.answers.values()) {
    // Socket payloads are untrusted.  Normalise once more here so a legacy or
    // reconnecting client cannot make a valid answer disappear from the chart.
    const selected = Number(response?.selected);
    if (Number.isInteger(selected) && selected >= 0 && selected < counts.length) counts[selected] += 1;
  }
  return counts;
}

function startIntroduction(game) {
  clearTimers(game);
  game.phase = 'introduction';
  game.introductionShown = true;
  io.to(game.code).emit('game:introduction', {
    game: publicGame(game),
    seconds: INTRODUCTION_MS / 1000
  });
  schedule(game, () => {
    if (game.phase === 'introduction') startQuestion(game, true);
  }, INTRODUCTION_MS);
}

function startQuestion(game, afterIntroduction = false) {
  if (game.questionIndex >= game.quiz.questions.length) return finishGame(game);
  if (game.questionIndex === 0 && !game.introductionShown && !afterIntroduction) return startIntroduction(game);
  clearTimers(game);
  game.phase = 'countdown';
  game.answers.clear();
  const question = game.quiz.questions[game.questionIndex];
  io.to(game.code).emit('game:countdown', { game: publicGame(game), seconds: ROUND_COUNTDOWN_MS / 1000, question: publicQuestion(question) });
  schedule(game, () => {
    if (game.phase !== 'countdown') return;
    game.phase = 'question';
    game.questionStartedAt = Date.now();
    // Players who join a game are only accepted in the lobby, so this snapshot
    // is the complete audience that can answer this particular question.
    game.roundPlayerIds = new Set(game.players.keys());
    io.to(game.code).emit('game:question', { game: publicGame(game), question: publicQuestion(question), endsAt: game.questionStartedAt + question.timeLimit * 1000 });
    schedule(game, () => revealQuestion(game), question.timeLimit * 1000);
  }, ROUND_COUNTDOWN_MS);
}

function revealQuestion(game) {
  if (game.phase !== 'question') return;
  // Cancel the deadline timer when this is an early reveal caused by every player answering.
  clearTimers(game);
  game.phase = 'reveal';
  const question = game.quiz.questions[game.questionIndex];
  const correctIndexes = question.answers.map((answer, index) => answer.correct ? index : null).filter((index) => index !== null);
  const answerCounts = calculateAnswerCounts(game, question);
  io.to(game.code).emit('game:reveal', {
    game: publicGame(game),
    // Send the same public question used during play so a host that reconnects
    // or has just changed view can always render a real results chart.
    question: publicQuestion(question),
    correctIndexes,
    answerCounts,
    answeredCount: game.answers.size,
    totalPlayers: activeRoundPlayerCount(game)
  });
  schedule(game, () => showLeaderboard(game), REVEAL_MS);
}

function showLeaderboard(game) {
  if (game.phase !== 'reveal') return;
  game.phase = 'leaderboard';
  const final = game.questionIndex === game.quiz.questions.length - 1;
  io.to(game.code).emit('game:leaderboard', { game: publicGame(game), leaderboard: leaderboard(game), final });

  // A lobby used to remain in this phase indefinitely: the only way forward
  // was an invisible client-side host:next call. Advance ordinary rounds on
  // a short, visible leaderboard interval, while keeping host:next available
  // for a host who wants to move the class along immediately.
  schedule(game, () => {
    if (game.phase !== 'leaderboard') return;
    if (final) finishGame(game);
    else {
      game.questionIndex += 1;
      startQuestion(game);
    }
  }, LEADERBOARD_MS);
}

function finishGame(game) {
  clearTimers(game);
  game.phase = 'finished';
  io.to(game.code).emit('game:ended', { game: publicGame(game), leaderboard: leaderboard(game) });
}

io.on('connection', (socket) => {
  const fail = (message) => socket.emit('app:error', { message });
  socket.on('quiz:validate', (quiz, reply) => { const result = validateQuiz(quiz); if (typeof reply === 'function') reply(result); });
  socket.on('host:create-game', ({ quiz } = {}, reply) => {
    const result = validateQuiz(quiz);
    if (!result.valid) { if (typeof reply === 'function') reply(result); return fail(result.errors[0]); }
    const code = uniqueCode();
    const game = { code, hostId: socket.id, quiz: result.quiz, players: new Map(), phase: 'lobby', questionIndex: 0, questionStartedAt: 0, answers: new Map(), roundPlayerIds: new Set(), timers: [], introductionShown: false };
    games.set(code, game); socket.join(code); socket.data.gameCode = code; socket.data.isHost = true;
    const payload = { code, game: publicGame(game) }; socket.emit('host:game-created', payload); if (typeof reply === 'function') reply({ ok: true, ...payload });
  });
  socket.on('player:join-game', ({ code, name } = {}, reply) => {
    const game = games.get(cleanText(code, 6)); const playerName = cleanText(name, 40);
    if (!game || game.phase !== 'lobby') return fail('That game is unavailable or has already started.');
    if (!playerName) return fail('Enter a player name.');
    if ([...game.players.values()].some((player) => player.name.toLowerCase() === playerName.toLowerCase())) return fail('That player name is already in use.');
    const player = { id: socket.id, name: playerName, score: 0, streak: 0 };
    game.players.set(socket.id, player); socket.join(game.code); socket.data.gameCode = game.code; socket.data.isHost = false;
    const payload = { player, game: publicGame(game) }; socket.emit('player:joined', payload); if (typeof reply === 'function') reply({ ok: true, ...payload }); emitLobby(game);
  });
  socket.on('host:start-game', () => { const game = getGame(socket); if (!game || game.hostId !== socket.id) return fail('Only the host can start the game.'); if (game.phase !== 'lobby') return fail('The game has already started.'); startQuestion(game); });
  socket.on('host:next', () => { const game = getGame(socket); if (!game || game.hostId !== socket.id) return fail('Only the host can advance the game.'); if (game.phase === 'reveal') { clearTimers(game); showLeaderboard(game); } else if (game.phase === 'leaderboard' && game.questionIndex < game.quiz.questions.length - 1) { clearTimers(game); game.questionIndex += 1; startQuestion(game); } });
  socket.on('host:end-game', () => { const game = getGame(socket); if (!game || game.hostId !== socket.id) return fail('Only the host can end the game.'); finishGame(game); });
  socket.on('player:answer', ({ answerIndex } = {}) => {
    const game = getGame(socket); const player = game?.players.get(socket.id);
    if (!game || !player || game.phase !== 'question') return fail('Answers are not open right now.');
    if (game.answers.has(socket.id)) return fail('You have already answered.');
    const question = game.quiz.questions[game.questionIndex]; const selected = Number(answerIndex);
    if (!Number.isInteger(selected) || !question.answers[selected]) return fail('That answer is not valid.');
    // Refuse answers from a socket that did not receive this round.  This is
    // mostly defensive (joining is locked after the lobby), but keeps the
    // answer map and chart in perfect agreement with the round denominator.
    if (!game.roundPlayerIds.has(socket.id)) return fail('You are not part of this question.');
    const elapsed = Math.max(0, Date.now() - game.questionStartedAt); const correct = question.answers[selected].correct;
    let points = 0;
    if (correct) { const speedScore = Math.max(0, Math.round(1000 * (1 - elapsed / (question.timeLimit * 1000)))); const multiplier = 1 + Math.min(player.streak, 4) * 0.25; points = Math.round(speedScore * multiplier); player.score += points; player.streak += 1; } else player.streak = 0;
    game.answers.set(socket.id, { selected, correct, points });
    // Do not disclose correctness, points, or placement while the question is open.
    // The client should use this only to move the player to their waiting state.
    socket.emit('player:answer-confirmed', { answered: true, answeredCount: game.answers.size, totalPlayers: activeRoundPlayerCount(game) });
    // This intentionally includes a one-person room: their first answer
    // immediately ends the question instead of making them watch the timer.
    if (everyoneHasAnswered(game)) revealQuestion(game);
  });
  socket.on('disconnect', () => {
    const game = getGame(socket);
    if (!game) return;
    if (game.hostId === socket.id) { finishGame(game); games.delete(game.code); return; }
    if (!game.players.delete(socket.id)) return;
    game.answers.delete(socket.id);
    game.roundPlayerIds?.delete(socket.id);
    if (game.phase === 'lobby') emitLobby(game);
    else if (game.phase === 'question' && everyoneHasAnswered(game)) revealQuestion(game);
  });
});

server.listen(PORT, () => console.log(`Quizly listening on ${PORT}`));

module.exports = { app, validateQuiz, calculateAnswerCounts, everyoneHasAnswered };
