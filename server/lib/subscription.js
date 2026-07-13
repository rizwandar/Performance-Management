const { queryOne } = require('../db/database');

async function getUserPlan(userId) {
  const sub = await queryOne('SELECT plan, status FROM subscriptions WHERE user_id = $1', [userId]);
  if (!sub) return 'free';
  if (sub.status === 'active' || sub.status === 'trialing') return sub.plan;
  return 'free';
}

async function isPremium(userId) {
  return (await getUserPlan(userId)) === 'premium';
}

module.exports = { getUserPlan, isPremium };
