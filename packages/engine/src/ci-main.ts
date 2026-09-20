/**
 * Process entry for the GitHub Action. Everything of substance is in ci.ts, which is
 * kept importable so it can be exercised without spawning a process.
 */
import { runCi } from "./ci.js";

process.exitCode = await runCi();
