import express from "express";
import { Inngest } from "inngest";
import { serve } from "inngest/express";
import crypto from "node:crypto";

const app = express();
app.use(express.json());

const reportsDb = new Map();

export const inngest = new Inngest({
  id: "report-api",
  isDev: true,
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// -------------------------------------------------------------
// STAGE 3: Background Function sa retries i greškom za "fail"
// -------------------------------------------------------------
const makeReport = inngest.createFunction(
  {
    id: "make-report",
    triggers: [{ event: "report/requested" }],
    // Konfigurišemo maksimalno 2 retrija (ukupno 3 pokušaja)
    retries: 2,
  },
  async ({ event, step }) => {
    const { id, topic } = event.data;

    await step.sleep("do-the-slow-work", "8s");

    await step.run("build-report", async () => {
      // STAGE 3: Ako je tema "fail", simularamo krah sistema
      if (topic === "fail") {
        throw new Error("The report oven is broken!");
      }

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
// STAGE 3: Express Endpoints sa validacijom ulaza
// -------------------------------------------------------------
app.post("/reports", async (req, res) => {
  const { topic } = req.body;

  // STAGE 3 VALIDACIJA: Ako nema teme ili je prazna, vrati 400 Bad Request
  if (!topic || typeof topic !== "string" || topic.trim() === "") {
    return res.status(400).json({ error: "Field 'topic' is required" });
  }

  const id = crypto.randomUUID();
  const report = { id, topic, status: "pending" };
  reportsDb.set(id, report);

  await inngest.send({
    name: "report/requested",
    data: { id, topic },
  });

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
