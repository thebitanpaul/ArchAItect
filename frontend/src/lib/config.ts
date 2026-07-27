/** Backend base URL. In production set VITE_API_BASE (e.g. your Render URL);
 *  falls back to localhost for local development.
 *
 *  Lives in its own module so both `api.ts` and `llm.ts` can use it without an
 *  import cycle (llm.ts talks to the backend; api.ts reads llm.ts for credentials).
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
