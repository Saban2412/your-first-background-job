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
// STAGE 2 & 3: Background Function (make-report)
// -------------------------------------------------------------
const makeReport = inngest.createFunction(
  {
    id: "make-report",
    triggers: [{ event: "report/requested" }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { id, topic } = event.data;

    await step.sleep("do-the-slow-work", "8s");

    await step.run("build-report", async () => {
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
// STAGE 4: Cron Function (heartbeat)
// -------------------------------------------------------------
const heartbeat = inngest.createFunction(
  {
    id: "heartbeat",
    triggers: [{ cron: "* * * * *" }],
  },
  async ({ step }) => {
    await step.run("log-summary", async () => {
      let pending = 0;
      let done = 0;

      for (const report of reportsDb.values()) {
        if (report.status === "pending") pending++;
        if (report.status === "done") done++;
      }

      const summary = `[CRON HEARTBEAT] Total reports: ${reportsDb.size} | Pending: ${pending} | Done: ${done}`;
      console.log(summary);
      return { summary };
    });
  },
);

// -------------------------------------------------------------
// Express Endpoints
// -------------------------------------------------------------
app.post("/reports", async (req, res) => {
  const topic = req.body?.topic;

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
    functions: [makeReport, heartbeat],
  }),
);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
