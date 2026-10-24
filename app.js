import express from "express";
import { Inngest } from "inngest";
import { serve } from "inngest/express";
import crypto from "node:crypto";

const app = express();
app.use(express.json());

// -------------------------------------------------------------
// STAGE 2: In-memory baza za izveštaje
// -------------------------------------------------------------
const reportsDb = new Map();

export const inngest = new Inngest({
  id: "report-api",
  isDev: true,
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// -------------------------------------------------------------
// STAGE 2: Background Function (make-report)
// -------------------------------------------------------------
// -------------------------------------------------------------
// STAGE 2: Background Function (make-report)
// -------------------------------------------------------------
const makeReport = inngest.createFunction(
  {
    id: "make-report",
    triggers: [{ event: "report/requested" }], // <--- OVDJE JE PROMJENA
  },
  async ({ event, step }) => {
    const { id, topic } = event.data;

    await step.sleep("do-the-slow-work", "8s");

    await step.run("build-report", async () => {
      console.log("Tražim u DB report sa ID-jem:", id);
      console.log("Trenutno stanje u DB:", reportsDb.get(id));

      const existingReport = reportsDb.get(id);
      if (existingReport) {
        reportsDb.set(id, {
          ...existingReport,
          status: "done",
          result: `Report for topic '${topic}' successfully generated at ${new Date().toISOString()}`,
        });
      }
    });
  },
);

// -------------------------------------------------------------
// STAGE 2: Express Endpoints
// -------------------------------------------------------------

app.post("/reports", async (req, res) => {
  const { topic } = req.body;
  const id = crypto.randomUUID();

  const report = { id, topic, status: "pending" };
  reportsDb.set(id, report);

  await inngest.send({
    name: "report/requested",
    data: { id, topic },
  });
  console.log("Spremljen report u DB sa ID-jem:", id);
  res.status(202).json(report);
});

app.get("/reports/:id", (req, res) => {
  const { id } = req.params;
  const report = reportsDb.get(id);

  if (!report) {
    return res.status(404).json({ error: "Report not found" });
  }

  res.json(report);
});

app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [makeReport],
  }),
);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
