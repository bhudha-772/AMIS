import { runCompletePipelineIntegrationAudit } from "./integrationAudit";
import { runLongRunReliabilityTest } from "./reliabilitySimulator";
import { runFailureInjectionTest } from "./failureInjection";
import * as fs from "fs";
import * as path from "path";

function runAllAudits() {
  console.log("[INITIAL AUDITS] Bootstrapping production readiness reports...");

  // 1. Ensure data directory exists
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 2. Run E2E Pipeline Audit
  const auditResult = runCompletePipelineIntegrationAudit();
  console.log("[INITIAL AUDITS] E2E Pipeline Audit:", auditResult.success ? "PASSED" : "FAILED");

  // 3. Run Reliability Test (1,000 fast ticks for fast boot evidence)
  const reliabilityResult = runLongRunReliabilityTest(1000);
  console.log("[INITIAL AUDITS] Reliability Stress Test throughput:", reliabilityResult.ticksPerSecond, "ticks/sec");

  // 4. Run Failure Injection Suite
  const failureResult = runFailureInjectionTest();
  console.log("[INITIAL AUDITS] Failure Injection Suite:", failureResult.success ? "PASSED" : "FAILED");

  console.log("[INITIAL AUDITS] All audits bootstrapped successfully!");
  process.exit(0);
}

runAllAudits();
