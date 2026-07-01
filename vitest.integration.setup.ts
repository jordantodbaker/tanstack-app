// Load environment for integration tests so `process.env.TEST_DATABASE_URL`
// is populated before the harness reads it. `.env.test` (git-ignored) wins
// over `.env`, so you can keep the disposable test DB URL separate from your
// dev `DATABASE_URL`. Exported shell vars still take precedence over both.
import { config } from "dotenv";

config(); // .env
config({ path: ".env.test", override: true }); // optional override
