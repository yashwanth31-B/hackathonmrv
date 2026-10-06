import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set — using an insecure default. Set it in .env before production.');
}

const SECRET = JWT_SECRET || 'civicfix_insecure_default_secret';

// ---------------------------------------------------------------------------
// authenticate — required: caller must be logged in
// ---------------------------------------------------------------------------
export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Provide a valid Bearer token in the Authorization header.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;  // { id, email, role, name, iat, exp }
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Session expired. Please log in again.'
        : 'Invalid authentication token.';

    return res.status(403).json({ success: false, message });
  }
};

// ---------------------------------------------------------------------------
// authorise — optional role guard (compose after authenticate)
// Usage: router.delete('/:id', authenticate, authorise('ADMIN'), handler)
// ---------------------------------------------------------------------------
export const authorise = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`
    });
  }

  next();
};

export default authenticate;
