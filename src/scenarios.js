const log = require('./logger');

// One function per QA case. Ids are NQA-xx so they never collide with the
// QA-xx ids coming out of orders-api when both apps share a group dashboard.
const scenarios = {
  // NQA-01 - all four levels as JSON objects.
  levels() {
    log.debug('[NQA-01 LEVELS] debug - idempotency key lookup', { key: 'pay_8821', hit: false });
    log.info('[NQA-01 LEVELS] info - payment captured', { paymentId: 'pay_8821', amount: 1499 });
    log.warn('[NQA-01 LEVELS] warn - webhook retry scheduled', { attempt: 3, backoffMs: 4000 });
    log.error('[NQA-01 LEVELS] error - capture failed', { paymentId: 'pay_8821', code: 'card_declined' });
  },

  // NQA-02 - a Node stack trace on stderr, multi line.
  stackTrace() {
    try {
      (function settle() {
        (function callGateway() {
          const err = new Error('connect ECONNREFUSED 10.0.0.14:5432');
          err.code = 'ECONNREFUSED';
          throw err;
        })();
      })();
    } catch (err) {
      process.stderr.write('[NQA-02 STACKTRACE] settlement failed\n' + err.stack + '\n');
    }
  },

  // NQA-03 - one long line, plus one longer than Docker's 16KB log chunk,
  // which is where a single line usually gets split into several.
  longLine() {
    log.info('[NQA-03 LONGLINE] ' + 'x'.repeat(7000));
    log.info('[NQA-03 LONGLINE-32K] ' + 'y'.repeat(32000));
  },

  // NQA-04 - non-latin text and emoji.
  unicode() {
    log.info('[NQA-04 UNICODE] payer: ग्राहक - 顧客 - العميل - Ünïcödé');
    log.warn('[NQA-04 UNICODE] refund queued \u{1F6A8} \u{1F4B8} ✅');
  },

  // NQA-05 - ANSI colour escapes, the kind a pretty printer emits locally.
  ansi() {
    const esc = String.fromCharCode(27);
    log.raw(esc + '[32m[NQA-05 ANSI] green text' + esc + '[0m plain text ' + esc + '[1;31mbold red' + esc + '[0m\n');
  },

  // NQA-06 - level traps: info lines containing the words error, warn, fatal.
  levelTraps() {
    log.info('[NQA-06 TRAP] this info line contains the word ERROR on purpose');
    log.info('[NQA-06 TRAP] upstream returned the string "fatal" in its body, we handled it');
    log.debug('[NQA-06 TRAP] matched /warn|error/ while parsing, still only a debug line');
    log.error('[NQA-06 TRAP] this one really is an error and should be the only red line here');
  },

  // NQA-07 - burst, for live tail and ingestion limits.
  burst(n) {
    log.info('[NQA-07 BURST] begin', { count: n });
    for (let i = 1; i <= n; i += 1) {
      log.info('[NQA-07 BURST] line ' + i + ' of ' + n, { seq: i });
    }
    log.info('[NQA-07 BURST] end', { count: n });
  },

  // NQA-08 - the same run mixing JSON lines with plain text lines.
  mixedFormats() {
    log.info('[NQA-08 MIXED] this one is JSON');
    log.raw('[NQA-08 MIXED] 2026-09-17 01:40:12 INFO plain text line, no JSON at all\n');
    log.raw('NQA-08 MIXED | pipe | delimited | line | 200 | 34ms\n');
    log.raw('<134>1 2026-09-17T01:40:12Z worker payments 1 - [NQA-08 MIXED] syslog shaped line\n');
  },

  // NQA-09 - stdout and stderr interleaved, to check ordering and capture.
  streams() {
    process.stdout.write('[NQA-09 STREAMS] stdout 1\n');
    process.stderr.write('[NQA-09 STREAMS] stderr 1\n');
    process.stdout.write('[NQA-09 STREAMS] stdout 2\n');
    process.stderr.write('[NQA-09 STREAMS] stderr 2\n');
  },

  // NQA-10 - a partial write with no newline, flushed only 5s later. Line
  // buffered pipelines hold this back until the newline arrives.
  partialLine() {
    process.stdout.write('[NQA-10 PARTIAL] this line has no newline yet ...');
    setTimeout(() => {
      process.stdout.write(' ... and here is the newline, 5s later\n');
    }, 5000);
  },

  // NQA-11 - sustained high rate for 10s, to provoke rate limiting or drops.
  sustained(seconds) {
    const until = Date.now() + seconds * 1000;
    let n = 0;
    const timer = setInterval(() => {
      for (let i = 0; i < 50; i += 1) {
        n += 1;
        log.info('[NQA-11 SUSTAINED] seq ' + n);
      }
      if (Date.now() > until) {
        clearInterval(timer);
        log.warn('[NQA-11 SUSTAINED] finished, wrote ' + n + ' lines - compare with what the viewer shows');
      }
    }, 100);
  },

  // NQA-12 - secret shaped strings.
  secrets() {
    log.warn('[NQA-12 SECRETS] stripe key sk_test_51QaFakeKeyForLogRedactionTesting0000');
    log.warn('[NQA-12 SECRETS] header Authorization: Basic cWFfdXNlcjpodW50ZXIy');
    log.warn('[NQA-12 SECRETS] card 4242 4242 4242 4242 exp 12/29 cvv 123');
  },

  // NQA-13 - unhandled rejection, which Node logs itself and then dies on.
  unhandledRejection() {
    log.error('[NQA-13 REJECTION] about to reject a promise with no catch');
    Promise.reject(new Error('[NQA-13 REJECTION] payments gateway returned 502'));
  },

  all() {
    log.info('[NQA-ALL] firing NQA-01 to NQA-12');
    scenarios.levels();
    scenarios.stackTrace();
    scenarios.longLine();
    scenarios.unicode();
    scenarios.ansi();
    scenarios.levelTraps();
    scenarios.burst(50);
    scenarios.mixedFormats();
    scenarios.streams();
    scenarios.partialLine();
    scenarios.secrets();
    log.info('[NQA-ALL] done');
  },
};

module.exports = scenarios;
