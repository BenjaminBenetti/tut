import { createRelay } from "./server.mjs";

const key = process.env.JevKey;
if (!key) throw new Error("Set JevKey in the container environment.");
const server = createRelay({
  key,
  origins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim()),
});
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
