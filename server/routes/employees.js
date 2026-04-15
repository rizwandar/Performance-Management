const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Search / list employees
router.get('/', (req, res) => {
  const { q } = req.query;
  let employees;
  if (q) {
    employees = db.prepare(`
      SELECT * FROM employees
      WHERE name LIKE ? OR department LIKE ? OR job_title LIKE ? OR email LIKE ?
      ORDER BY name
    `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    employees = db.prepare('SELECT * FROM employees ORDER BY name').all();
  }
  res.json(employees);
});

// Get single employee with their review cycles
router.get('/:id', (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const cycles = db.prepare('SELECT * FROM review_cycles WHERE employee_id = ? ORDER BY year DESC').all(employee.id);

  const cyclesWithDetails = cycles.map(cycle => {
    const goals = db.prepare('SELECT * FROM goals WHERE review_cycle_id = ? ORDER BY goal_number').all(cycle.id);
    const reviews = db.prepare('SELECT * FROM reviews WHERE review_cycle_id = ?').all(cycle.id);
    return { ...cycle, goals, reviews };
  });

  res.json({ ...employee, cycles: cyclesWithDetails });
});

// Create employee
router.post('/', (req, res) => {
  const { name, email, department, job_title } = req.body;
  if (!name || !email || !department || !job_title) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    const result = db.prepare(
      'INSERT INTO employees (name, email, department, job_title) VALUES (?, ?, ?, ?)'
    ).run(name, email, department, job_title);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Update employee
router.put('/:id', (req, res) => {
  const { name, email, department, job_title } = req.body;
  db.prepare(
    'UPDATE employees SET name=?, email=?, department=?, job_title=? WHERE id=?'
  ).run(name, email, department, job_title, req.params.id);
  res.json({ success: true });
});

module.exports = router;
