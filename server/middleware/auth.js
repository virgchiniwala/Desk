/**
 * Authentication middleware
 *
 * Verifies user is logged in via session cookie
 * Redirects to /login if not authenticated
 */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

/**
 * Require supervisor role
 *
 * Verifies user is logged in AND has supervisor role
 */
function requireSupervisor(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  if (req.session.user.role !== 'supervisor') {
    return res.status(403).render('layout', {
      title: 'Forbidden',
      body: '<h1>403 - Forbidden</h1><p>Supervisor access required</p><p><a href="/">Return to Home</a></p>'
    });
  }

  next();
}

/**
 * Redirect if already logged in
 *
 * Used on login page to prevent double-login
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session.user) {
    return res.redirect('/');
  }
  next();
}

module.exports = {
  requireAuth,
  requireSupervisor,
  redirectIfAuthenticated
};
