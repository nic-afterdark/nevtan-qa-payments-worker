# payments-worker

A fake payments worker. Like `orders-api` it only exists to produce log lines,
but it produces them in a different shape: JSON on stdout, errors on stderr.
Deploying both and putting them in one group is the point, because a group log
view has to cope with both formats at once.

- Stack: Node 20, Express
- Port: `PORT`, default `8080`
- Health: `GET /health`
- Index of every test route: `GET /qa/`
- `LOG_LEVEL` (`debug`, `info`, `warn`, `error`) sets the floor, default `debug`

Background traffic runs on its own: a line every 2 seconds, a heartbeat every
minute, and a burst of 15 errors every 5 minutes.

## Branches

| Branch | What it does |
| --- | --- |
| `main` | Builds and runs. Use it for runtime log testing. |
| `broken` | Fails during `npm install`, before any code runs. Use it for build log testing. |

## Test cases

Ids are `NQA-xx` here so they never collide with `orders-api`'s `QA-xx` when both
apps are in one group view.

| Id | Route | What it emits | What a correct viewer does |
| --- | --- | --- | --- |
| NQA-01 | `/qa/levels` | four JSON lines, one per level | the level is read from the JSON `level` field, not guessed |
| NQA-02 | `/qa/stacktrace` | a Node stack trace on stderr, plain text | stays together as one entry |
| NQA-03 | `/qa/longline` | one 7 KB line and one 32 KB line | the 32 KB line is the interesting one. Docker's json-file driver splits at 16 KB, so it usually arrives as 2-3 fragments. Check whether the viewer rejoins them or shows torn text |
| NQA-04 | `/qa/unicode` | devanagari, CJK, arabic, emoji | renders as text |
| NQA-05 | `/qa/ansi` | ANSI colour escapes written raw to stdout | rendered or stripped, never shown as `[32m` |
| NQA-06 | `/qa/traps` | info and debug lines containing the words ERROR and fatal | only the real error line is red |
| NQA-07 | `/qa/burst?n=500` | n numbered lines at once | all n arrive, sequence numbers unbroken |
| NQA-08 | `/qa/mixed` | JSON, plain text, pipe delimited and syslog shaped lines in one run | every shape is shown; the parser must not drop what it cannot parse |
| NQA-09 | `/qa/streams` | stdout and stderr interleaved, four lines | all four captured, in the order written |
| NQA-10 | `/qa/partial` | half a line, then the newline 5 seconds later | the line appears once, complete, after 5s. Half a line on screen, or the text lost, is a bug |
| NQA-11 | `/qa/sustained?s=10` | ~500 lines a second for s seconds | count what arrives against the total in the closing line. A gap is ingestion rate limiting, worth knowing about |
| NQA-12 | `/qa/secrets` | stripe key, basic auth header, card number | note what, if anything, is redacted |
| NQA-13 | `/qa/rejection` | an unhandled promise rejection, then exit 1 | the rejection and its trace are visible before the container restarts |
| NQA-14 | `/qa/500` | an error thrown inside a route handler | the trace reaches the logs and the response is 500 |
| NQA-15 | `/qa/oom` | 16 MB allocations until the container is killed | exit 137 or the heap error is visible in the logs |
| NQA-16 | `/qa/crash` | `process.exit(1)` | logs from before the crash survive the restart |
| all | `/qa/all` | NQA-01 to NQA-12 in order | a single pass over most of the table |

## Running it locally

```bash
npm install
PORT=8099 npm start
curl localhost:8099/qa/all
```
