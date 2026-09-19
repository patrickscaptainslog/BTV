// Turn a raw AppFolio/fetch error into something a non-engineer can act on.
// Pure and dependency-free so both server components and route handlers can use it.

export interface ApiErrorHelp {
  title: string;
  detail: string;
  steps: string[];
  raw: string;
}

export function explainApiError(message: string): ApiErrorHelp {
  const raw = message;

  // Credentials present but refused. AppFolio allows one active Reports API
  // pair per user, so generating new credentials revokes the old ones instantly.
  if (/\b401\b/.test(message) || /access denied/i.test(message)) {
    return {
      title: "AppFolio rejected the API credentials",
      detail:
        "The dashboard reached AppFolio, but the Reports API key was refused. This almost always means new credentials were generated in AppFolio — doing so revokes the previous pair immediately, and this deployment is still sending the old one.",
      steps: [
        "AppFolio → Developer Space → Reports API: copy the current Client ID and Client Secret.",
        "Vercel → Settings → Environment Variables: update APPFOLIO_CLIENT_ID and APPFOLIO_CLIENT_SECRET.",
        "Redeploy — environment variable changes only reach a new deployment.",
      ],
      raw,
    };
  }

  if (/Missing APPFOLIO/i.test(message)) {
    return {
      title: "AppFolio environment variables are not set",
      detail:
        "This deployment is missing one or more of APPFOLIO_DATABASE, APPFOLIO_CLIENT_ID or APPFOLIO_CLIENT_SECRET.",
      steps: [
        "Vercel → Settings → Environment Variables: add the missing values for Production.",
        "Redeploy so the new values take effect.",
      ],
      raw,
    };
  }

  if (/\b429\b/.test(message)) {
    return {
      title: "AppFolio rate limit reached",
      detail:
        "AppFolio allows roughly 7 requests every 15 seconds. The dashboard backs off automatically — this usually clears on its own.",
      steps: ["Wait about a minute, then press Refresh."],
      raw,
    };
  }

  if (/\b404\b/.test(message)) {
    return {
      title: "AppFolio report or database not found",
      detail:
        "The credentials were accepted but the requested report or database subdomain does not exist.",
      steps: [
        "Check APPFOLIO_DATABASE in Vercel — it is the subdomain only (the 'acme' in acme.appfolio.com).",
      ],
      raw,
    };
  }

  return {
    title: "Could not load data from AppFolio",
    detail: message,
    steps: ["Press Refresh. If it keeps failing, open /api/diag to check the connection."],
    raw,
  };
}
