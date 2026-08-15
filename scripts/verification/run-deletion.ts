import { pool } from "../../backend/src/db/pool";
import { processImmediateDeletionRequest, submitSelfAccountDeletion } from "../../backend/src/services/accountDeletionService";

async function main() {
  const action = process.argv[2];
  const id = process.argv[3];
  if (!id || (action !== "submit" && action !== "retry")) {
    throw new Error("Usage: run-deletion.ts <submit|retry> <user-or-request-id>");
  }

  const result = action === "submit"
    ? await submitSelfAccountDeletion(id, { isPlatformOwner: false })
    : { outcome: "retry", request: await processImmediateDeletionRequest(id) };
  console.log(JSON.stringify({
    outcome: result.outcome,
    requestId: result.request.id,
    status: result.request.status,
    workflowStage: result.request.workflowStage,
    attemptCount: result.request.attemptCount,
    lastErrorCode: result.request.lastErrorCode
  }));
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Deletion verification failed.");
    process.exitCode = 1;
  });
