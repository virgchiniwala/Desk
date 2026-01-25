const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const { redirectIfAuthenticated } = require('../middleware/auth');

const router = express.Router();

// GET /login - Show login form
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', {
    title: 'Login',
    error: req.query.error
  });
});

// POST /login - Process login
router.post('/login', redirectIfAuthenticated, (req, res) => {
  const { username, password } = req.body;

  // Validate inputs
  if (!username || !password) {
    return res.redirect('/login?error=Missing username or password');
  }

  // Query user
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  const user = stmt.get(username);

  if (!user) {
    return res.redirect('/login?error=Invalid username or password');
  }

  // Verify password
  const valid = bcrypt.compareSync(password, user.password_hash);

  if (!valid) {
    return res.redirect('/login?error=Invalid username or password');
  }

  // Create session
  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role
  };

  res.redirect('/');
});

// POST /logout - Destroy session
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
