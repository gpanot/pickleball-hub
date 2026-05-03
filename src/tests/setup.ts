import * as dotenv from "dotenv";
import { resolve } from "path";

// Load .env.local so DATABASE_URL and ANTHROPIC_API_KEY are available in tests
dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

// Use haiku for tests — it is cheaper, faster, and works with the dev API key.
// The production app uses Sonnet (set via ANTHROPIC_MODEL in the Railway env).
if (!process.env.ANTHROPIC_MODEL) {
  process.env.ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
}
