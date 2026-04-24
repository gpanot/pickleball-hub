/**
 * Trigger a Railway redeploy for the scraper service (GraphQL public API).
 * After deploy succeeds, Railway runs the cron container once for the new image.
 */

const RAILWAY_GRAPHQL = "https://backboard.railway.com/graphql/v2";

const REDEPLOY_MUTATION = `
  mutation ServiceInstanceRedeploy($environmentId: String!, $serviceId: String!) {
    serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
  }
`;

export type RedeployResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; details?: unknown };

export async function railwayRedeployScraper(): Promise<RedeployResult> {
  const token = process.env.RAILWAY_API_TOKEN;
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
  const serviceId = process.env.RAILWAY_SCRAPER_SERVICE_ID;

  if (!token || !environmentId || !serviceId) {
    return {
      ok: false,
      error:
        "Missing RAILWAY_API_TOKEN, RAILWAY_ENVIRONMENT_ID, or RAILWAY_SCRAPER_SERVICE_ID on this service.",
    };
  }

  const res = await fetch(RAILWAY_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: REDEPLOY_MUTATION,
      variables: { environmentId, serviceId },
    }),
  });

  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: { serviceInstanceRedeploy?: unknown };
  };

  if (!res.ok) {
    return { ok: false, error: `Railway HTTP ${res.status}`, details: json };
  }
  if (json.errors?.length) {
    return {
      ok: false,
      error: json.errors.map((e) => e.message).join("; "),
      details: json,
    };
  }

  return { ok: true, data: json.data?.serviceInstanceRedeploy ?? json.data };
}
