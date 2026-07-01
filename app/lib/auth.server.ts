import * as client from "openid-client";
import { createCookie, createCookieSessionStorage, data, redirect } from "react-router";
import { db, upsertUser, type UserRecord } from "./db.server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// --- OIDC configuration (Entra ID) ---

let oidcConfig: client.Configuration | null = null;

async function getOidcConfig(): Promise<client.Configuration> {
  if (oidcConfig) return oidcConfig;

  const tenantId = requireEnv("ENTRA_TENANT_ID");
  const clientId = requireEnv("ENTRA_CLIENT_ID");
  const clientSecret = requireEnv("ENTRA_CLIENT_SECRET");

  oidcConfig = await client.discovery(
    new URL(`https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`),
    clientId,
    undefined,
    client.ClientSecretPost(clientSecret),
  );
  return oidcConfig;
}

function getRedirectUri(): string {
  return `${requireEnv("APP_BASE_URL")}/auth/callback`;
}

// --- Transient login handshake cookie (state + PKCE verifier) ---

interface OAuthHandshake {
  state: string;
  codeVerifier: string;
}

const oauthCookie = createCookie("__oauth", {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 600,
  secrets: [requireEnv("SESSION_SECRET")],
});

export async function beginLogin(): Promise<{ url: URL; setCookieHeader: string }> {
  const config = await getOidcConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: getRedirectUri(),
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  const setCookieHeader = await oauthCookie.serialize({ state, codeVerifier } satisfies OAuthHandshake);
  return { url, setCookieHeader };
}

export async function completeLogin(
  request: Request,
): Promise<{ user: UserRecord; setCookieHeader: string }> {
  const handshake = (await oauthCookie.parse(request.headers.get("Cookie"))) as OAuthHandshake | null;
  if (!handshake) {
    throw new Error("Missing OAuth handshake cookie");
  }

  const config = await getOidcConfig();

  // Rebuild the callback URL from APP_BASE_URL rather than trusting
  // request.url's scheme/host: behind a TLS-terminating reverse proxy, the
  // app sees the proxy's internal http:// request, which would make
  // openid-client derive a redirect_uri that doesn't match the https://
  // one used in beginLogin(), and Entra ID rejects the mismatch
  // (AADSTS500112).
  const incomingUrl = new URL(request.url);
  const callbackUrl = new URL(
    `${requireEnv("APP_BASE_URL")}${incomingUrl.pathname}${incomingUrl.search}`,
  );

  const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: handshake.codeVerifier,
    expectedState: handshake.state,
  });

  const claims = tokens.claims();
  if (!claims) {
    throw new Error("ID token missing claims");
  }

  const adminGroupId = requireEnv("ENTRA_ADMIN_GROUP_ID");
  const groups = Array.isArray(claims.groups) ? (claims.groups as string[]) : [];

  // TEMPORARY diagnostic log — remove once the admin group mismatch is root-caused.
  console.log(
    "[auth debug] adminGroupId env:",
    JSON.stringify(adminGroupId),
    "claims.groups:",
    JSON.stringify(claims.groups),
    "_claim_names:",
    JSON.stringify((claims as Record<string, unknown>)._claim_names),
  );

  const user = upsertUser(db, {
    id: String(claims.sub),
    email: String(claims.email ?? claims.preferred_username ?? ""),
    name: String(claims.name ?? ""),
    isAdmin: groups.includes(adminGroupId),
  });

  const session = await sessionStorage.getSession();
  session.set("userId", user.id);
  const setCookieHeader = await sessionStorage.commitSession(session);

  return { user, setCookieHeader };
}

// --- Long-lived app session ---

interface SessionData {
  userId: string;
}

export const sessionStorage = createCookieSessionStorage<SessionData>({
  cookie: {
    name: "__session",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    secrets: [requireEnv("SESSION_SECRET")],
  },
});

export async function getUserFromSession(request: Request): Promise<UserRecord | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  if (!userId) return null;

  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as
    | { id: string; email: string; name: string; is_admin: number; last_login_at: string }
    | undefined;
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isAdmin: !!row.is_admin,
    lastLoginAt: row.last_login_at,
  };
}

export async function requireUser(request: Request): Promise<UserRecord> {
  const user = await getUserFromSession(request);
  if (!user) {
    throw redirect("/login");
  }
  return user;
}

export async function requireAdmin(request: Request): Promise<UserRecord> {
  const user = await requireUser(request);
  if (!user.isAdmin) {
    throw data("No tienes permiso para acceder a esta sección.", 403);
  }
  return user;
}

export async function destroyUserSession(request: Request): Promise<string> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return sessionStorage.destroySession(session);
}
