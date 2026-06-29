import { createNotesApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || "127.0.0.1";

const app = createNotesApp();
app.listen(PORT, HOST, () => {
  console.log(`PRISM Notes API on http://${HOST}:${PORT} (/api/notes)`);
});
