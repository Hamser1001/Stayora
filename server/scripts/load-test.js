import http from 'node:http';
import { writeFileSync } from 'node:fs';

/**
 * Load / stress harness for the Stayora API.
 *
 *   node scripts/load-test.js --requests=200 --concurrency=20
 *   node scripts/load-test.js --stress            # 10/25/50/100 concurrent users
 *
 * Uses keep-alive sockets (like a real client) and reports latency
 * percentiles per endpoint plus throughput for the mixed scenario.
 */

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);

const BASE = process.env.BASE_URL || 'http://localhost:4000/api';
const REQUESTS = Number(args.requests) || 200;
const CONCURRENCY = Number(args.concurrency) || 20;
const agent = new http.Agent({ keepAlive: true, maxSockets: Math.max(CONCURRENCY, 100) });

const today = new Date();
const iso = (date) => date.toISOString().slice(0, 10);
const monthStart = iso(new Date(today.getFullYear(), today.getMonth(), 1));
const monthEnd = iso(today);

function call(path, { method = 'GET', body, token } = {}) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      `${BASE}${path}`,
      {
        method,
        agent,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            ms: Number(process.hrtime.bigint() - started) / 1e6,
            bytes,
          });
        });
      },
    );
    req.on('error', () => resolve({ status: 0, ms: Number(process.hrtime.bigint() - started) / 1e6, bytes: 0 }));
    if (payload) req.write(payload);
    req.end();
  });
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function runScenario(name, path, { requests, concurrency, token }) {
  const latencies = [];
  const statuses = new Map();
  let bytes = 0;
  let next = 0;
  const started = process.hrtime.bigint();

  async function worker() {
    while (next < requests) {
      next += 1;
      const result = await call(path, { token });
      latencies.push(result.ms);
      bytes += result.bytes;
      statuses.set(result.status, (statuses.get(result.status) || 0) + 1);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker));
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  latencies.sort((a, b) => a - b);

  return {
    scenario: name,
    endpoint: path,
    requests,
    concurrency,
    rps: Math.round((requests / seconds) * 10) / 10,
    p50: Math.round(percentile(latencies, 50)),
    p95: Math.round(percentile(latencies, 95)),
    p99: Math.round(percentile(latencies, 99)),
    max: Math.round(latencies[latencies.length - 1] || 0),
    avgKb: Math.round((bytes / requests / 1024) * 10) / 10,
    failures: [...statuses.entries()].filter(([status]) => status !== 200 && status !== 201).reduce((sum, [, n]) => sum + n, 0),
    statuses: Object.fromEntries(statuses),
  };
}

const SCENARIOS = [
  ['reservations list (page 1)', '/reservations?page=1&pageSize=12'],
  ['reservations search', '/reservations?page=1&pageSize=12&search=STY&status=confirmed&sort=arrival&direction=desc'],
  ['guests list', '/guests?page=1&pageSize=12&sort=name'],
  ['payments list', `/payments?page=1&pageSize=25&from=${monthStart}&to=${monthEnd}`],
  ['expenses list', `/expenses?page=1&pageSize=25&from=${monthStart}&to=${monthEnd}`],
  ['dashboard', `/dashboard?start=${monthStart}&end=${monthEnd}`],
  ['reports', `/reports?start=${monthStart}&end=${monthEnd}`],
  ['rooms', '/rooms'],
  ['calendar (month)', `/reservations/calendar?start=${monthStart}&end=${monthEnd}`],
  ['notifications', '/notifications'],
  ['settings', '/settings'],
];

async function main() {
  const health = await call('/health');
  if (health.status !== 200) {
    console.error(`API not reachable at ${BASE} (status ${health.status}). Start it with "npm run dev".`);
    process.exit(1);
  }

  const token = await new Promise((resolve) => {
    const payload = JSON.stringify({ email: 'hamza@stayora.app', password: 'stayora2026' });
    const req = http.request(
      `${BASE}/auth/login`,
      {
        method: 'POST',
        agent,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body)?.data?.token || null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
  if (!token) console.warn('Could not sign in — write scenarios will be skipped.');
  const scenarioToken = token;

  const results = [];
  console.log(`\nLoad test against ${BASE} — ${REQUESTS} requests per scenario, concurrency ${CONCURRENCY}\n`);

  for (const [name, path] of SCENARIOS) {
    const result = await runScenario(name, path, { requests: REQUESTS, concurrency: CONCURRENCY, token: scenarioToken });
    results.push(result);
    console.log(
      `${name.padEnd(30)} p50 ${String(result.p50).padStart(5)}ms  p95 ${String(result.p95).padStart(5)}ms  p99 ${String(result.p99).padStart(5)}ms  ${String(result.rps).padStart(6)} rps  ${result.avgKb}kB  failures ${result.failures}`,
    );
  }

  // Mixed traffic: realistic browsing of the busiest screens.
  const mixedPaths = SCENARIOS.filter(([name]) =>
    ['reservations list (page 1)', 'guests list', 'payments list', 'dashboard', 'reports', 'rooms'].includes(name),
  ).map(([, path]) => path);
  const mixedLatencies = [];
  let mixedBytes = 0;
  let mixedFailures = 0;
  let cursor = 0;
  const mixedRequests = REQUESTS;
  const mixedStarted = process.hrtime.bigint();
  async function mixedWorker() {
    while (cursor < mixedRequests) {
      const index = cursor;
      cursor += 1;
      const result = await call(mixedPaths[index % mixedPaths.length], { token: scenarioToken });
      mixedLatencies.push(result.ms);
      mixedBytes += result.bytes;
      if (result.status !== 200) mixedFailures += 1;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, mixedWorker));
  mixedLatencies.sort((a, b) => a - b);
  const mixedSeconds = Number(process.hrtime.bigint() - mixedStarted) / 1e9;
  const mixed = {
    scenario: 'mixed browsing',
    requests: mixedRequests,
    concurrency: CONCURRENCY,
    rps: Math.round((mixedRequests / mixedSeconds) * 10) / 10,
    p50: Math.round(percentile(mixedLatencies, 50)),
    p95: Math.round(percentile(mixedLatencies, 95)),
    p99: Math.round(percentile(mixedLatencies, 99)),
    max: Math.round(mixedLatencies[mixedLatencies.length - 1] || 0),
    avgKb: Math.round((mixedBytes / mixedRequests / 1024) * 10) / 10,
    failures: mixedFailures,
  };
  results.push(mixed);
  console.log(
    `${'mixed browsing'.padEnd(30)} p50 ${String(mixed.p50).padStart(5)}ms  p95 ${String(mixed.p95).padStart(5)}ms  p99 ${String(mixed.p99).padStart(5)}ms  ${String(mixed.rps).padStart(6)} rps  failures ${mixedFailures}`,
  );

  // Write concurrency steps (stress).
  const stress = [];
  if (args.stress !== undefined) {
    for (const concurrency of [10, 25, 50, 100]) {
      const step = await runScenario('mixed stress', mixedPaths[0], { requests: 400, concurrency, token: scenarioToken });
      const requestsPerSecond = step.rps;
      // Mixed traffic for a fair throughput number.
      let c = 0;
      const latencies = [];
      const started = process.hrtime.bigint();
      const total = 400;
      async function worker() {
        while (c < total) {
          const index = c;
          c += 1;
          const result = await call(mixedPaths[index % mixedPaths.length], { token: scenarioToken });
          latencies.push(result.ms);
        }
      }
      await Promise.all(Array.from({ length: concurrency }, worker));
      latencies.sort((a, b) => a - b);
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      stress.push({
        concurrency,
        rps: Math.round((total / seconds) * 10) / 10,
        p50: Math.round(percentile(latencies, 50)),
        p95: Math.round(percentile(latencies, 95)),
        p99: Math.round(percentile(latencies, 99)),
        singleEndpointRps: requestsPerSecond,
      });
      console.log(
        `stress ${String(concurrency).padStart(3)} users           p50 ${String(stress[stress.length - 1].p50).padStart(5)}ms  p95 ${String(stress[stress.length - 1].p95).padStart(5)}ms  ${String(stress[stress.length - 1].rps).padStart(6)} rps`,
      );
    }
  }

  const report = { base: BASE, requests: REQUESTS, concurrency: CONCURRENCY, generatedAt: new Date().toISOString(), results, stress };
  writeFileSync(new URL('./load-test-results.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log('\nReport written to server/scripts/load-test-results.json');
  agent.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
