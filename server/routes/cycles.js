const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Create a new review cycle for an employee
router.post('/', (req, res) => {
  const { employee_id, year, start_month } = req.body;
  if (!employee_id || !year) {
    return res.status(400).json({ error: 'employee_id and year are required' });
  }
  const result = db.prepare(
    'INSERT INTO review_cycles (employee_id, year, start_month) VALUES (?, ?, ?)'
  ).run(employee_id, year, start_month || 1);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Add or update goals for a cycle
router.put('/:cycleId/goals', (req, res) => {
  const { goals } = req.body; // array of { goal_number, title, description }
  if (!Array.isArray(goals) || goals.length > 3) {
    return res.status(400).json({ error: 'Provide up to 3 goals' });
  }

  const upsert = db.prepare(`
    INSERT INTO goals (review_cycle_id, goal_number, title, description)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(review_cycle_id, goal_number) DO UPDATE SET title=excluded.title, description=excluded.description
  `);

  const insertMany = db.transaction((goals) => {
    for (const g of goals) {
      upsert.run(req.params.cycleId, g.goal_number, g.title, g.description || '');
    }
  });

  insertMany(goals);
  res.json({ success: true });
});

// Add or update a review (midyear or final)
router.put('/:cycleId/reviews/:type', (req, res) => {
  const { type } = req.params;
  const { comments } = req.body;

  if (!['midyear', 'final'].includes(type)) {
    return res.status(400).json({ error: 'type must be midyear or final' });
  }

  const existing = db.prepare(
    'SELECT id FROM reviews WHERE review_cycle_id = ? AND type = ?'
  ).get(req.params.cycleId, type);

  if (existing) {
    db.prepare(
      'UPDATE reviews SET comments=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?'
    ).run(comments, existing.id);
  } else {
    db.prepare(
      'INSERT INTO reviews (review_cycle_id, type, comments) VALUES (?, ?, ?)'
    ).run(req.params.cycleId, type, comments);
  }

  res.json({ success: true });
});

module.exports = router;
