import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import notesRouter from './routes/notes.js';
import './db/index.js';

const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '512kb' }));

app.use('/api/notes', notesRouter);

app.listen(PORT, HOST, () => {
  console.log(`PRISM Notes API on http://${HOST}:${PORT} (/api/notes)`);
});
