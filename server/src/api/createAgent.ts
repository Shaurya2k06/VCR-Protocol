import { randomUUID } from "crypto";
import { Router } from "express";
import { createPendingAgent, markAgentFailed } from "../models/QueuedAgent.js";
import { enqueueStorePolicyJob } from "../queue/agentQueue.js";

interface CreateAgentRequestBody {
  policy: unknown;
}

function isCreateAgentRequestBody(value: unknown): value is CreateAgentRequestBody {
  return Boolean(value && typeof value === "object" && "policy" in value);
}

const router = Router();

router.post("/create-agent", async (req, res) => {
  if (!isCreateAgentRequestBody(req.body)) {
    return res.status(400).json({ error: "Request body must include a policy field" });
  }

  const agentId = randomUUID();

  try {
    await createPendingAgent(agentId);

    try {
      await enqueueStorePolicyJob({
        agentId,
        policy: req.body.policy,
      });
    } catch (error) {
      const enqueueError = error as Error;
      await markAgentFailed(agentId, `Queue enqueue failed: ${enqueueError.message}`);
      throw enqueueError;
    }

    return res.status(202).json({
      agentId,
      status: "PENDING",
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to create agent",
      message: (error as Error).message,
    });
  }
});

export default router;
