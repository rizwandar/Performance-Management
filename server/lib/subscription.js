const db = require('../db/database');

const FREE_SECTIONS = new Set([
  'messages',
  'songs-that-define-me',
  'lifes-wishes',
  'how-to-be-remembered', // lives on users table, no route gating needed
]);

function getUserPlan(userId) {
  const sub = db.prepare('SELECT plan, status FROM subscriptions WHERE user_id = ?').get(userId);
  if (!sub) return 'free';
  if (sub.status === 'active' || sub.status === 'trialing') return sub.plan;
  return 'free';
}

function isPremium(userId) {
  return getUserPlan(userId) === 'premium';
}

module.exports = { getUserPlan, isPremium, FREE_SECTIONS };
