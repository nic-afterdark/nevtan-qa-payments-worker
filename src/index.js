const express = require('express');
const log = require('./logger');
const scenarios = require('./scenarios');

const app = express();
const port = process.env.PORT || 8080;

const routes = {
  'GET /health': 'liveness, one debug line',
  'GET /qa/levels': 'NQA-01 debug, info, warn, error as JSON',
  'GET /qa/stacktrace': 'NQA-02 node stack trace on stderr',
  'GET /qa/longline': 'NQA-03 one 7KB line and one 32KB line',
  'GET /qa/unicode': 'NQA-04 devanagari, CJK, arabic, emoji',
  'GET /qa/ansi': 'NQA-05 ANSI colour escapes',
  'GET /qa/traps': 'NQA-06 info lines containing the word ERROR',
  'GET /qa/burst?n=500': 'NQA-07 n numbered lines at once',
  'GET /qa/mixed': 'NQA-08 JSON, plain, pipe and syslog shaped lines together',
  'GET /qa/streams': 'NQA-09 stdout and stderr interleaved',
  'GET /qa/partial': 'NQA-10 line written without a newline for 5s',
  'GET /qa/sustained?s=10': 'NQA-11 500 lines a second for s seconds',
  'GET /qa/secrets': 'NQA-12 key, header and card shaped strings',
  'GET /qa/rejection': 'NQA-13 unhandled promise rejection, process exits',
  'GET /qa/500': 'NQA-14 unhandled express error, 500 response',
  'GET /qa/oom': 'NQA-15 allocate until the container is OOM killed',
  'GET /qa/crash': 'NQA-16 exit(1) immediately, restart loop',
  'GET /qa/all': 'fire NQA-01 to NQA-12 in order',
};

app.get('/', (req, res) => {
  log.info('GET / - payments-worker is up', { qaRoutes: '/qa/' });
  res.json({ app: 'payments-worker', qaRoutes: '/qa/', health: '/health' });
});

app.get('/health', (req, res) => {
  log.debug('GET /health - ok');
  res.json({ status: 'UP' });
});

app.get('/qa', (req, res) => res.json(routes));
app.get('/qa/', (req, res) => res.json(routes));

app.get('/qa/levels', (req, res) => { scenarios.levels(); res.send('NQA-01 fired'); });
app.get('/qa/stacktrace', (req, res) => { scenarios.stackTrace(); res.send('NQA-02 fired'); });
app.get('/qa/longline', (req, res) => { scenarios.longLine(); res.send('NQA-03 fired'); });
app.get('/qa/unicode', (req, res) => { scenarios.unicode(); res.send('NQA-04 fired'); });
app.get('/qa/ansi', (req, res) => { scenarios.ansi(); res.send('NQA-05 fired'); });
app.get('/qa/traps', (req, res) => { scenarios.levelTraps(); res.send('NQA-06 fired'); });
app.get('/qa/mixed', (req, res) => { scenarios.mixedFormats(); res.send('NQA-08 fired'); });
app.get('/qa/streams', (req, res) => { scenarios.streams(); res.send('NQA-09 fired'); });
app.get('/qa/partial', (req, res) => { scenarios.partialLine(); res.send('NQA-10 fired'); });
app.get('/qa/secrets', (req, res) => { scenarios.secrets(); res.send('NQA-12 fired'); });
app.get('/qa/all', (req, res) => { scenarios.all(); res.send('NQA-01..NQA-12 fired'); });

app.get('/qa/burst', (req, res) => {
  const n = Math.min(parseInt(req.query.n, 10) || 500, 20000);
  scenarios.burst(n);
  res.send('NQA-07 fired with n=' + n);
});

app.get('/qa/sustained', (req, res) => {
  const s = Math.min(parseInt(req.query.s, 10) || 10, 60);
  scenarios.sustained(s);
  res.send('NQA-11 running for ' + s + 's');
});

app.get('/qa/rejection', (req, res) => {
  res.send('NQA-13 fired, process should die');
  setTimeout(() => scenarios.unhandledRejection(), 100);
});

app.get('/qa/500', () => {
  log.info('[NQA-14 UNHANDLED] about to throw inside a route handler');
  throw new Error('[NQA-14 UNHANDLED] paymentId "abc" is not a valid id');
});

// NQA-15 - grow an array until the container's memory limit kills the process.
const ballast = [];
app.get('/qa/oom', (req, res) => {
  log.warn('[NQA-15 OOM] allocating 16MB at a time, expect exit 137 or a heap OOM');
  res.send('NQA-15 fired');
  const timer = setInterval(() => {
    ballast.push(Buffer.alloc(16 * 1024 * 1024, 1));
    log.error('[NQA-15 OOM] ballast now ' + ballast.length * 16 + 'MB');
  }, 200);
  timer.unref();
});

app.get('/qa/crash', (req, res) => {
  log.error('[NQA-16 CRASH] calling process.exit(1), container should restart');
  res.send('NQA-16 fired, exiting in 200ms');
  setTimeout(() => process.exit(1), 200);
});

// Steady background traffic so the panel and any charts always have data.
let paymentId = 5000;
setInterval(() => {
  paymentId += 1;
  const roll = Math.floor(Math.random() * 100);
  const base = { paymentId: 'pay_' + paymentId, amount: 199 + Math.floor(Math.random() * 4800) };
  if (roll < 20) {
    log.debug('queue poll', { ...base, queueDepth: Math.floor(Math.random() * 40) });
  } else if (roll < 90) {
    log.info('payment captured', { ...base, status: 'CAPTURED', latencyMs: 20 + Math.floor(Math.random() * 280) });
  } else if (roll < 98) {
    log.warn('webhook delivery retrying', { ...base, attempt: 2 + Math.floor(Math.random() * 3) });
  } else {
    log.error('capture failed', { ...base, status: 'FAILED', code: 'insufficient_funds' });
  }
}, 2000);

// A predictable error burst every 5 minutes, for charts and alert rules.
setInterval(() => {
  log.warn('[SPIKE] gateway circuit breaker opened, 15 failures follow');
  for (let i = 1; i <= 15; i += 1) {
    paymentId += 1;
    log.error('[SPIKE] capture failed', { paymentId: 'pay_' + paymentId, code: 'gateway_502', attempt: i });
  }
  log.info('[SPIKE] circuit breaker closed, back to normal');
}, 300000);

setInterval(() => {
  const mb = Math.round(process.memoryUsage().rss / (1024 * 1024));
  log.info('[HEARTBEAT] payments-worker alive', { paymentsProcessed: paymentId - 5000, rssMb: mb });
}, 60000);

app.use((err, req, res, next) => {
  process.stderr.write('[NQA-14 UNHANDLED] ' + err.stack + '\n');
  res.status(500).json({ error: err.message });
});

process.on('unhandledRejection', (err) => {
  process.stderr.write('[NQA-13 REJECTION] unhandled rejection, exiting\n' + err.stack + '\n');
  process.exit(1);
});

app.listen(port, () => {
  log.info('[BOOT] payments-worker listening', { port, node: process.version, qaRoutes: '/qa/' });
});
