import { performance } from "perf_hooks";

const url = process.argv[2];
const iterations = Number(process.argv[3] ?? 100);
if (!url || !Number.isInteger(iterations) || iterations < 1 || iterations > 10_000) {
  throw new Error("Usage: benchmark-http.mjs <url> [iterations]");
}

const samples = [];
const statuses = {};
for (let index = 0; index < iterations; index += 1) {
  const startedAt = performance.now();
  const headers = {};
  if (process.env.BENCHMARK_BEARER_TOKEN) headers.Authorization = `Bearer ${process.env.BENCHMARK_BEARER_TOKEN}`;
  if (process.env.BENCHMARK_ROTATE_IP === "1") headers["x-forwarded-for"] = `198.51.100.${(index % 200) + 1}`;
  const response = await fetch(url, {
    headers
  });
  await response.arrayBuffer();
  samples.push(performance.now() - startedAt);
  statuses[response.status] = (statuses[response.status] ?? 0) + 1;
}

samples.sort((left, right) => left - right);
const percentile = (value) => samples[Math.min(samples.length - 1, Math.ceil((value / 100) * samples.length) - 1)];
console.log(JSON.stringify({
  url: new URL(url).pathname,
  iterations,
  statuses,
  p50Ms: Number(percentile(50).toFixed(2)),
  p95Ms: Number(percentile(95).toFixed(2)),
  p99Ms: Number(percentile(99).toFixed(2)),
  minMs: Number(samples[0].toFixed(2)),
  maxMs: Number(samples.at(-1).toFixed(2))
}));
