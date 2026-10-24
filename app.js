import express from "express";
import { Inngest } from "inngest";
import { serve } from "inngest/express";

const app = express();
app.use(express.json());

// Stage 0: Health endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// -------------------------------------------------------------
// STAGE 1: Inngest setup
// -------------------------------------------------------------

export const inngest = new Inngest({ id: "report-api" });

const sayHello = inngest.createFunction(
  { id: "say-hello", event: "test/hello" },
  async ({ event, step }) => {
    await step.sleep("wait-a-few-seconds", "5s");

    return "Hello from the background!";
  },
);
app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [sayHello],
  }),
);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
