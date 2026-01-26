const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/db');

const router = express.Router();

// Middleware to check if signup is allowed (no users exist)
function signupAllowed(req, res, next) {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();

  if (userCount.count > 0) {
    // Users exist, redirect to login
    return res.redirect('/login');
  }

  next();
}

// GET /signup - Show signup form (only if no users exist)
router.get('/', signupAllowed, (req, res) => {
  res.render('signup', {
    title: 'Create Account',
    error: req.query.error
  });
});

// POST /signup - Create first user (supervisor)
router.post('/', signupAllowed, async (req, res) => {
  const { username, password, confirmPassword } = req.body;

  // Validate inputs
  if (!username || !password || !confirmPassword) {
    return res.redirect('/signup?error=All fields are required');
  }

  if (password !== confirmPassword) {
    return res.redirect('/signup?error=Passwords do not match');
  }

  if (password.length < 8) {
    return res.redirect('/signup?error=Password must be at least 8 characters');
  }

  if (username.length < 3) {
    return res.redirect('/signup?error=Username must be at least 3 characters');
  }

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user (first user is always supervisor)
    db.prepare(`
      INSERT INTO users (username, password, role)
      VALUES (?, ?, 'supervisor')
    `).run(username, hashedPassword);

    // Auto-login
    const user = db.prepare(`
      SELECT id, username, role
      FROM users
      WHERE username = ?
    `).get(username);

    req.session.user = user;

    console.log(`[Signup] First user created: ${username} (supervisor)`);

    // Redirect to chat
    res.redirect('/chat');
  } catch (error) {
    console.error('Error creating user:', error);

    if (error.code === 'SQLITE_CONSTRAINT') {
      return res.redirect('/signup?error=Username already exists');
    }

    res.redirect('/signup?error=Failed to create account');
  }
});

module.exports = router;
