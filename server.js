const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const routes = require('./routes/index');
const { connect, registerSseMap } = require('./utils/realtime');

const app = express();
const PORT = process.env.PORT || 3000;

const sseClients = new Map();
registerSseMap(sseClients);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

app.use('/data', express.static(path.join(__dirname, 'data')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/battle/events', (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const ping = setInterval(() => res.write(': ping\n\n'), 25000);

  if (!sseClients.has(chat_id)) sseClients.set(chat_id, new Set());
  sseClients.get(chat_id).add(res);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.get(chat_id)?.delete(res);
    if (sseClients.get(chat_id)?.size === 0) sseClients.delete(chat_id);
  });
});

app.use('/api', routes);

app.get('/debug-env', (req, res) => {
  res.json({
    supabase_url: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
    supabase_anon_key: process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING',
  });
});

app.get('*', (req, res, next) => {
  if (path.extname(req.path)) return next();
  const fs = require('fs');
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const injected = html.replace('<head>', `<head><script>
    window.__SUPABASE_URL__ = "${process.env.SUPABASE_URL}";
    window.__SUPABASE_ANON_KEY__ = "${process.env.SUPABASE_ANON_KEY}";
  </script>`);
  res.send(injected);
});

connect();
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));