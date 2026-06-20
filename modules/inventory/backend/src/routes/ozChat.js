import { Router } from 'express';
import { processOzQuery, getOzStatus, ensureOzWarmup } from '../services/ozAI.js';

const router = Router();

router.get('/status', (req, res) => {
  ensureOzWarmup();
  res.json(getOzStatus());
});

router.post('/', async (req, res) => {
  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ response: 'Please provide messages.' });
  }
  const last = messages[messages.length - 1];
  const userMessage = typeof last?.content === 'string' ? last.content : '';
  if (!userMessage.trim()) {
    return res.status(400).json({ response: 'Please provide a non-empty message.' });
  }
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : 'system',
    content: String(m.content || ''),
  }));

  try {
    const response = await processOzQuery(userMessage, history);
    res.json({ response });
  } catch (error) {
    console.error('Oz chat error:', error);
    res.status(500).json({ response: 'Oz could not process that request. Please try again.' });
  }
});

export default router;
