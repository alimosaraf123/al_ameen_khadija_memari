const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const router = express.Router();

router.get('/', auth, asyncHandler(async (req, res) => {
  const r = await pool.query('SELECT * FROM rooms ORDER BY room_name');
  res.json({ success: true, rooms: r.rows });
}));

router.post('/', auth, allow('super_admin','admin'), asyncHandler(async (req, res) => {
  const { room_name, description = null } = req.body;
  const r = await pool.query(
    'INSERT INTO rooms(room_name, description) VALUES($1,$2) RETURNING *',
    [room_name, description]
  );
  res.status(201).json({ success: true, room: r.rows[0] });
}));

router.put('/:id', auth, allow('super_admin','admin'), asyncHandler(async (req, res) => {
  const { room_name, description = null, is_active = true } = req.body;
  const r = await pool.query(
    `UPDATE rooms SET room_name=$1, description=$2, is_active=$3 WHERE id=$4 RETURNING *`,
    [room_name, description, is_active, req.params.id]
  );
  res.json({ success: true, room: r.rows[0] });
}));

router.delete('/:id', auth, allow('super_admin'), asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM rooms WHERE id=$1', [req.params.id]);
  res.json({ success: true });
}));

module.exports = router;
