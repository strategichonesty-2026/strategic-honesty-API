const express = require('express');
const helmet = require('helmet');
const youtubeRouter = require('./routes/youtube');
const bufferRouter = require('./routes/buffer');
const mediaRouter = require('./routes/media');

function createApp() {
  const app = express();

  // Railway terminates TLS at its edge and forwards over plain HTTP —
  // without this, req.protocol always reads 'http' and rate-limiting's
  // own IP detection misreads X-Forwarded-For (both need to trust the
  // single reverse-proxy hop Railway adds).
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/youtube', youtubeRouter);
  app.use('/buffer', bufferRouter);
  app.use('/media', mediaRouter);

  return app;
}

module.exports = { createApp };
