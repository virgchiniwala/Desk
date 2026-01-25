const express = require('express');
const session = require('express-session');
const SqliteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Initialize database
require('./db/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for simplicity
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));

// Body parsing
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration (cookie-based, not JWT)
app.use(session({
  store: new SqliteStore({
    db: 'desk.db',
    dir: path.join(__dirname, 'db')
  }),
  secret: process.env.SESSION_SECRET || 'desk-development-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make user available to all templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
const authRoutes = require('./routes/auth');
const indexRoutes = require('./routes/index');
const jobsRoutes = require('./routes/jobs');
const artifactsRoutes = require('./routes/artifacts');

app.use('/', authRoutes);
app.use('/', indexRoutes);
app.use('/jobs', jobsRoutes);
app.use('/artifacts', artifactsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('layout', {
    title: 'Not Found',
    body: '<h1>404 - Page Not Found</h1><p><a href="/">Return to Home</a></p>'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).render('layout', {
    title: 'Error',
    body: `<h1>500 - Server Error</h1><p>${process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'}</p><p><a href="/">Return to Home</a></p>`
  });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('Desk Platform MVP - Server Started');
  console.log('='.repeat(60));
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📂 Jobs directory: ${path.resolve(__dirname, '../jobs')}`);
  console.log(`🗄️  Database: ${path.resolve(__dirname, 'db/desk.db')}`);
  console.log('');
  console.log('Default login: admin / admin123');
  console.log('');
});
