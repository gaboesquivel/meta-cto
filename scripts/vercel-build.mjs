import { execSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

execSync("pnpm build", { cwd: root, env: process.env, stdio: "inherit" });
