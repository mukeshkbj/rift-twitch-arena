import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { GameEngine } from "./game/engine.js";
import { GameScheduler } from "./game/scheduler.js";
import { createRoutes } from "./http/routes.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const engine = new GameEngine();
const scheduler = new GameScheduler(engine);

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use("/api", createRoutes(engine));

engine.subscribe((snapshot) => io.emit("game:snapshot", snapshot));
io.on("connection", (socket) => {
  socket.emit("game:snapshot", engine.getSnapshot());
});
scheduler.start();

if (process.env.NODE_ENV === "production") {
  const clientPath = path.resolve(process.cwd(), "dist/client");
  app.use(express.static(clientPath));
  app.get("*path", (_request, response) => response.sendFile(path.join(clientPath, "index.html")));
}

const port = Number(process.env.PORT ?? 3000);
httpServer.listen(port, "127.0.0.1", () => {
  console.log(`RIFT server ready at http://127.0.0.1:${port}`);
});

const shutdown = (): void => {
  scheduler.stop();
  io.close(() => httpServer.close());
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
