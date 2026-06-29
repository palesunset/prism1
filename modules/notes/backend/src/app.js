import cors from "cors";
import express from "express";
import notesRouter from "./routes/notes.js";
import "./db/index.js";

export function createNotesApp() {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "512kb" }));
  app.use("/api/notes", notesRouter);
  return app;
}
