import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import ipamRouter from './routes/ipam.js';
import './db/index.js';

const PORT = Number(process.env.PORT) || 3003;
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/ipam', ipamRouter);

app.listen(PORT, HOST, () => {
  console.log(`PRISM Mini IPAM API on http://${HOST}:${PORT} (/api/ipam)`);
});
