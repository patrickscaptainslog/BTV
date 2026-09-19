import { describe, it, expect } from "@jest/globals";
import { explainApiError } from "../apiError";

describe("explainApiError", () => {
  it("recognises the AppFolio 401 as revoked/rotated credentials", () => {
    // The exact string the dashboard surfaced on 2026-09-19.
    const help = explainApiError("AppFolio API 401: HTTP Basic: Access denied.");
    expect(help.title).toMatch(/rejected the API credentials/i);
    expect(help.detail).toMatch(/revokes the previous pair/i);
    expect(help.steps.join(" ")).toMatch(/APPFOLIO_CLIENT_SECRET/);
    expect(help.steps.join(" ")).toMatch(/redeploy/i);
  });

  it("distinguishes unset env vars from rejected credentials", () => {
    const help = explainApiError("Missing APPFOLIO_CLIENT_ID or APPFOLIO_CLIENT_SECRET");
    expect(help.title).toMatch(/not set/i);
  });

  it("explains rate limiting without prescribing a redeploy", () => {
    const help = explainApiError("AppFolio API 429: Too Many Requests");
    expect(help.title).toMatch(/rate limit/i);
    expect(help.steps.join(" ")).not.toMatch(/redeploy/i);
  });

  it("points at the database subdomain on a 404", () => {
    const help = explainApiError("AppFolio API 404: Not Found");
    expect(help.steps.join(" ")).toMatch(/APPFOLIO_DATABASE/);
  });

  it("falls back to the raw message and always preserves it", () => {
    const help = explainApiError("socket hang up");
    expect(help.detail).toBe("socket hang up");
    expect(help.raw).toBe("socket hang up");
  });
});
