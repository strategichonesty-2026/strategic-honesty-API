function internalAuth(req, res, next) {
  const token = req.header('X-Internal-Token');
  if (!token || token !== process.env.INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({ error: 'Missing or invalid X-Internal-Token' });
  }
  next();
}

module.exports = { internalAuth };
