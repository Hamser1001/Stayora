import { connectDatabase, disconnectDatabase } from '../src/db/connect.js';
import { models } from '../src/db/models.js';
import { env } from '../src/config/env.js';
import { addDays, todayISO } from '../src/lib/dates.js';

/** Prints the winning plan for the queries that back the hot endpoints. */
function planSummary(plan, depth = 0) {
  if (!plan) return [];
  const name = plan.stage || plan.queryPlanner?.winningPlan?.stage;
  const lines = [`${'  '.repeat(depth)}${name}${plan.indexName ? ` (${plan.indexName})` : ''}`];
  const children = [plan.inputStage, plan.queryPlanner?.winningPlan, plan.innerStage, ...(plan.inputStages || [])]
    .filter(Boolean);
  children.forEach((child) => lines.push(...planSummary(child, depth + 1)));
  return lines;
}

async function explain(label, collection, filter, { sort, limit } = {}) {
  const cursor = collection.find(filter);
  if (sort) cursor.sort(sort);
  if (limit) cursor.limit(limit);
  const result = await cursor.explain('executionStats');
  const stats = result.executionStats || {};
  const plan = result.queryPlanner?.winningPlan || {};
  const stages = planSummary(plan)
    .map((line) => line.trim())
    .filter((line) => !['SINGLE_SHARD', 'SHARD_WRITE'].includes(line));
  console.log(`\n${label}`);
  console.log(`  plan:    ${stages.join(' → ')}`);
  console.log(
    `  keys:    ${stats.totalKeysExamined}  docs: ${stats.totalDocsExamined}  returned: ${stats.nReturned}  time: ${stats.executionTimeMillis}ms`,
  );
  return {
    label,
    stages,
    keysExamined: stats.totalKeysExamined,
    docsExamined: stats.totalDocsExamined,
    returned: stats.nReturned,
    ms: stats.executionTimeMillis,
  };
}

async function main() {
  await connectDatabase();
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  console.log(`Explaining queries against ${env.mongoUri}`);

  const results = [];
  results.push(
    await explain('Reservations: status filter + arrival sort + page', models.Reservation, { status: 'confirmed' }, {
      sort: { arrival: -1, id: -1 },
      limit: 12,
    }),
  );
  results.push(
    await explain('Reservations: count by status', models.Reservation, { status: 'checkedIn' }),
  );
  results.push(
    await explain('Reservations: overlap window (calendar)', models.Reservation, {
      status: { $nin: ['cancelled', 'noShow'] },
      arrival: { $lt: addDays(monthStart, 40) },
      departure: { $gt: monthStart },
    }),
  );
  results.push(
    await explain('Reservations: guest stays', models.Reservation, { guestId: { $in: ['gst_1', 'gst_2'] } }, {
      sort: { arrival: -1 },
    }),
  );
  results.push(
    await explain('Payments: date range + newest first', models.Payment, {
      date: { $gte: monthStart, $lte: today },
    }, { sort: { date: -1, createdAt: -1 }, limit: 25 }),
  );
  results.push(
    await explain('Expenses: date range + newest first', models.Expense, {
      date: { $gte: monthStart, $lte: today },
    }, { sort: { date: -1 }, limit: 25 }),
  );
  results.push(await explain('Guests: name prefix search', models.Guest, { name: /^Am/i }, { sort: { name: 1 }, limit: 12 }));
  results.push(
    await explain('Notifications: newest first', models.Notification, {}, { sort: { createdAt: -1 }, limit: 40 }),
  );

  await disconnectDatabase();
  return results;
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
