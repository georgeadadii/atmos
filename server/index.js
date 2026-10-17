import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(currentDirectory, "..", "public");

export const app = express();

app.get("/api/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "atmos",
  });
});

app.use(express.static(publicDirectory));

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const port = process.env.PORT || 3000;

  app.listen(port, () => {
    console.log(`Atmos is running at http://localhost:${port}`);
  });
}
