const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { name, pin } = req.body;
    
    if (!name || !pin) {
      return res.status(400).json({ error: 'Name and PIN are required' });
    }

    const user = db.findUserByName(name.trim());
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await db.verifyPin(user, pin);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    db.updateLastLogin(user.id);

    const token = jwt.sign(
      { userId: user.id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.SESSION_EXPIRY || '24h' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify token
router.get('/verify', authenticate, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Create user (admin only)
router.post('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, pin, role = 'staff' } = req.body;
    
    if (!name || !pin) {
      return res.status(400).json({ error: 'Name and PIN are required' });
    }

    if (pin.length < 4) {
      return res.status(400).json({ error: 'PIN must be at least 4 characters' });
    }

    const existing = db.findUserByName(name);
    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const userId = await db.createUser(name.trim(), pin, role);
    res.status(201).json({ success: true, userId });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// List users (admin only)
router.get('/users', authenticate, requireAdmin, (req, res) => {
  try {
    const users = db.getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users' });
  }
});

module.exports = router;
