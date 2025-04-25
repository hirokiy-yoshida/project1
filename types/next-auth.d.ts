import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    accessToken?: string;
    refreshToken?: string;
    instanceUrl?: string;
    shozokuTenpoId?: string;
  }

  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      accessToken?: string;
      instanceUrl?: string;
      shozokuTenpoId?: string;
    };
    error?: "RefreshAccessTokenError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    instanceUrl?: string;
    shozokuTenpoId?: string;
    error?: "RefreshAccessTokenError";
    exp?: number;
    iat?: number;
    jti?: string;
  }
}