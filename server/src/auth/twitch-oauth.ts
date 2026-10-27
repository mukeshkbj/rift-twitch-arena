import { randomBytes } from "node:crypto";

const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_REVOKE_URL = "https://id.twitch.tv/oauth2/revoke";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";
const CHAT_SCOPE = "user:read:chat";

interface TwitchConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  appBaseUrl: string;
}

interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}

interface TwitchUserResponse {
  data?: Array<{ id?: unknown; login?: unknown }>;
}

export interface TwitchAccount {
  id: string;
  login: string;
}

export interface TwitchAuthStatus {
  configured: boolean;
  connected: boolean;
  login: string | null;
  scope: string | null;
}

interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class TwitchOAuth {
  private readonly config: TwitchConfig;
  private tokens: TokenSet | null = null;
  private account: TwitchAccount | null = null;
  private readonly pendingStates = new Map<string, number>();

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.config = {
      clientId: env.TWITCH_CLIENT_ID?.trim() ?? "",
      clientSecret: env.TWITCH_CLIENT_SECRET?.trim() ?? "",
      redirectUri: env.TWITCH_REDIRECT_URI?.trim() || "http://localhost:3000/api/auth/twitch/callback",
      appBaseUrl: env.APP_BASE_URL?.trim() || (env.NODE_ENV === "production" ? "http://localhost:3000" : "http://localhost:5173"),
    };
  }

  getAppBaseUrl(): string {
    return this.config.appBaseUrl;
  }

  getClientId(): string {
    this.requireConfigured();
    return this.config.clientId;
  }

  status(): TwitchAuthStatus {
    return {
      configured: Boolean(this.config.clientId && this.config.clientSecret),
      connected: this.tokens !== null && this.account !== null,
      login: this.account?.login ?? null,
      scope: this.tokens ? CHAT_SCOPE : null,
    };
  }

  createAuthorizationUrl(): string {
    this.requireConfigured();
    const now = Date.now();
    for (const [state, expiresAt] of this.pendingStates) {
      if (expiresAt <= now) this.pendingStates.delete(state);
    }
    const state = randomBytes(24).toString("hex");
    this.pendingStates.set(state, now + 10 * 60_000);
    const url = new URL(TWITCH_AUTHORIZE_URL);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", CHAT_SCOPE);
    url.searchParams.set("state", state);
    return url.toString();
  }

  cancelAuthorization(state: unknown): void {
    if (typeof state === "string") this.consumeState(state);
  }

  async completeAuthorization(state: unknown, code: unknown): Promise<TwitchAccount> {
    this.requireConfigured();
    if (typeof state !== "string" || !this.consumeState(state)) {
      throw new Error("The Twitch sign-in session expired. Start the connection again.");
    }
    if (typeof code !== "string" || !code) throw new Error("Twitch did not return an authorization code.");

    const tokenResponse = await this.fetchToken(new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: this.config.redirectUri,
    }));
    const tokens = this.parseTokens(tokenResponse);
    if (!tokens.scope.includes(CHAT_SCOPE)) throw new Error("Twitch did not grant permission to read chat.");

    const account = await this.fetchAccount(tokens.accessToken);
    this.tokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
    };
    this.account = account;
    return account;
  }

  async getAccessToken(): Promise<string> {
    this.requireConnected();
    if (this.tokens!.expiresAt > Date.now() + 60_000) return this.tokens!.accessToken;

    const tokenResponse = await this.fetchToken(new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: this.tokens!.refreshToken,
    }));
    const next = this.parseTokens(tokenResponse);
    this.tokens = {
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      expiresAt: Date.now() + next.expiresIn * 1000,
    };
    return next.accessToken;
  }

  getAccount(): TwitchAccount {
    this.requireConnected();
    return { ...this.account! };
  }

  async disconnect(): Promise<void> {
    const tokens = this.tokens;
    this.tokens = null;
    this.account = null;
    if (!tokens || !this.config.clientId) return;

    try {
      const url = new URL(TWITCH_REVOKE_URL);
      url.searchParams.set("client_id", this.config.clientId);
      url.searchParams.set("token", tokens.accessToken);
      await fetch(url, { method: "POST", signal: AbortSignal.timeout(5_000) });
    } catch {
      // Local credentials are cleared even if Twitch's revoke endpoint is unreachable.
    }
  }

  private consumeState(state: string): boolean {
    const expiresAt = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    return expiresAt !== undefined && expiresAt > Date.now();
  }

  private async fetchToken(body: URLSearchParams): Promise<TokenResponse> {
    let response: Response;
    try {
      response = await fetch(TWITCH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch {
      throw new Error("Could not reach Twitch authorization. Check the server connection and try again.");
    }
    if (!response.ok) throw new Error("Twitch authorization failed. Check the app credentials and redirect URI.");
    return response.json() as Promise<TokenResponse>;
  }

  private parseTokens(value: TokenResponse): { accessToken: string; refreshToken: string; expiresIn: number; scope: string[] } {
    if (typeof value.access_token !== "string" || typeof value.refresh_token !== "string" ||
        typeof value.expires_in !== "number" || !Array.isArray(value.scope) ||
        !value.scope.every((scope) => typeof scope === "string")) {
      throw new Error("Twitch returned an incomplete authorization response.");
    }
    return {
      accessToken: value.access_token,
      refreshToken: value.refresh_token,
      expiresIn: value.expires_in,
      scope: value.scope,
    };
  }

  private async fetchAccount(accessToken: string): Promise<TwitchAccount> {
    let response: Response;
    try {
      response = await fetch(TWITCH_USERS_URL, {
        headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": this.config.clientId },
      });
    } catch {
      throw new Error("Could not load the connected Twitch account.");
    }
    if (!response.ok) throw new Error("Could not load the connected Twitch account.");
    const payload = await response.json() as TwitchUserResponse;
    const user = payload.data?.[0];
    if (typeof user?.id !== "string" || typeof user.login !== "string") {
      throw new Error("Twitch did not return an account for this authorization.");
    }
    return { id: user.id, login: user.login };
  }

  private requireConfigured(): void {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to .env before connecting.");
    }
  }

  private requireConnected(): void {
    if (!this.tokens || !this.account) throw new Error("Connect a Twitch account first.");
  }
}
