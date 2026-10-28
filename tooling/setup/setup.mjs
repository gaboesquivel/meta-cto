import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const envExample = path.join(root, ".env.example");
const envLocal = path.join(root, ".env.local");

if (!existsSync(envLocal) && existsSync(envExample)) copyFileSync(envExample, envLocal);

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 24) {
  console.error("Node.js 24+ is required.");
  process.exit(1);
}

try {
  execSync("pnpm -v", { stdio: "ignore" });
} catch {
  console.error("pnpm is required. Enable via corepack.");
  process.exit(1);
}

if (!existsSync(path.join(root, "node_modules")))
  execSync("pnpm install", { cwd: root, stdio: "inherit" });

const skipSkills =
  process.env.FLOW_SETUP_SKIP_SKILLS === "1" || process.env.FLOW_SETUP_SKIP_SKILLS === "true";

const agentsDir = path.join(root, ".agents");
if (!skipSkills && existsSync(path.join(agentsDir, "skills-lock.json"))) {
  if (!existsSync(path.join(agentsDir, "node_modules")))
    execSync("pnpm install", { cwd: agentsDir, stdio: "inherit" });
  execSync("pnpm skills:install", { cwd: agentsDir, stdio: "inherit" });
}

console.log("setup complete — review .env.local before running pnpm dev");
