import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

const CONNECTION_CONFIG = {
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  REQUEST_TIMEOUT: 30000,
  KEEP_ALIVE_MSECS: 3000,
  MAX_SOCKETS: 100,
  MAX_FREE_SOCKETS: 10,
  SOCKET_TIMEOUT: 30000
};

// セキュアなHTTPSエージェントの設定
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: CONNECTION_CONFIG.KEEP_ALIVE_MSECS,
  maxSockets: CONNECTION_CONFIG.MAX_SOCKETS,
  maxFreeSockets: CONNECTION_CONFIG.MAX_FREE_SOCKETS,
  timeout: CONNECTION_CONFIG.SOCKET_TIMEOUT,
  rejectUnauthorized: true, // SSL証明書の検証を強制
});

const axiosInstance = axios.create({
  httpsAgent,
  timeout: CONNECTION_CONFIG.REQUEST_TIMEOUT,
  maxRedirects: 5,
  validateStatus: status => status >= 200 && status < 300,
  headers: {
    'User-Agent': 'Drink-Order-System/1.0',
  }
});

// セキュアなトークンキャッシュの実装
class SecureTokenCache {
  private cache: Map<string, {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    hash: string;
  }>;

  constructor() {
    this.cache = new Map();
  }

  private generateHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  set(key: string, value: { accessToken: string; refreshToken: string; expiresAt: number }) {
    const hash = this.generateHash(JSON.stringify(value));
    this.cache.set(key, { ...value, hash });
  }

  get(key: string): { accessToken: string; refreshToken: string; expiresAt: number } | null {
    const value = this.cache.get(key);
    if (!value) return null;

    // 整合性チェック
    const currentHash = this.generateHash(JSON.stringify({
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      expiresAt: value.expiresAt
    }));

    if (currentHash !== value.hash) {
      this.cache.delete(key);
      return null;
    }

    return {
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      expiresAt: value.expiresAt
    };
  }

  clear() {
    this.cache.clear();
  }
}

const tokenCache = new SecureTokenCache();

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> {
  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.SF_CLIENT_ID!,
      client_secret: process.env.SF_CLIENT_SECRET!,
      refresh_token: refreshToken
    });

    const response = await axiosInstance.post(
      process.env.SF_TOKEN_URL!,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (!response.data.access_token) {
      throw new Error('No access token received');
    }

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token || refreshToken,
      expiresAt: Date.now() + ((response.data.expires_in - 300) * 1000)
    };
  } catch (error) {
    console.error('Token refresh failed:', error);
    tokenCache.clear();
    throw new Error('Failed to refresh access token');
  }
}

async function validateToken(accessToken: string): Promise<boolean> {
  try {
    const response = await axiosInstance.get(
      `${process.env.SF_INSTANCE_URL}/services/oauth2/userinfo`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    return response.status === 200;
  } catch {
    return false;
  }
}

async function getUserInfo(accessToken: string) {
  const response = await axiosInstance.get(
    `${process.env.SF_INSTANCE_URL}/services/oauth2/userinfo`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.data.user_id) {
    throw new Error('Invalid user info response');
  }

  return response.data;
}

async function fetchUserCustomField(accessToken: string, userId: string) {
  const response = await axiosInstance.get(
    `${process.env.SF_INSTANCE_URL}/services/data/v58.0/sobjects/User/${userId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const shozokuTenpoId = response.data.ShozokuTenpoID__c;
  if (!shozokuTenpoId) {
    throw new Error('ShozokuTenpoID__c not found for user');
  }

  return shozokuTenpoId;
}

// 入力値のバリデーション
function validateCredentials(username: string, password: string): boolean {
  if (!username || !password) return false;
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  if (username.length > 255 || password.length > 255) return false;
  if (username.includes('<') || username.includes('>')) return false;
  return true;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Salesforce",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          throw new Error('Username and password are required');
        }

        if (!validateCredentials(credentials.username, credentials.password)) {
          throw new Error('Invalid credentials format');
        }

        try {
          const params = new URLSearchParams({
            grant_type: 'password',
            client_id: process.env.SF_CLIENT_ID!,
            client_secret: process.env.SF_CLIENT_SECRET!,
            username: credentials.username,
            password: credentials.password
          });

          const response = await axiosInstance.post(
            process.env.SF_TOKEN_URL!,
            params.toString(),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Drink-Order-System/1.0',
              }
            }
          );

          if (!response.data.access_token) {
            throw new Error('No access token received');
          }

          const userInfo = await getUserInfo(response.data.access_token);
          const shozokuTenpoId = await fetchUserCustomField(
            response.data.access_token,
            userInfo.user_id
          );

          tokenCache.set(credentials.username, {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresAt: Date.now() + ((response.data.expires_in - 300) * 1000)
          });

          return {
            id: userInfo.user_id,
            name: userInfo.name,
            email: userInfo.email,
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            instanceUrl: process.env.SF_INSTANCE_URL,
            shozokuTenpoId
          };
        } catch (error) {
          console.error('Authentication error:', error);
          if (axios.isAxiosError(error) && error.response?.status === 400) {
            throw new Error('Invalid credentials');
          }
          throw new Error('Authentication failed');
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 12 * 60 * 60, // 12時間
    updateAge: 60 * 60, // 1時間ごとに更新
  },
  jwt: {
    maxAge: 12 * 60 * 60, // 12時間
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.instanceUrl = user.instanceUrl;
        token.shozokuTenpoId = user.shozokuTenpoId;
        token.exp = Math.floor(Date.now() / 1000) + 3600;
      }

      const tokenExpiry = token.exp ? token.exp * 1000 : 0;
      const shouldRefresh = tokenExpiry - Date.now() < 300000;

      if (shouldRefresh && token.refreshToken) {
        try {
          const isValid = await validateToken(token.accessToken as string);
          if (!isValid) {
            const refreshedToken = await refreshAccessToken(token.refreshToken as string);
            return {
              ...token,
              accessToken: refreshedToken.accessToken,
              refreshToken: refreshedToken.refreshToken,
              exp: Math.floor(refreshedToken.expiresAt / 1000)
            };
          }
        } catch (error) {
          console.error('Token refresh failed:', error);
          return { ...token, error: "RefreshAccessTokenError" };
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.error === "RefreshAccessTokenError") {
        session.error = "RefreshAccessTokenError";
      }

      if (session.user) {
        session.user.accessToken = token.accessToken as string;
        session.user.instanceUrl = token.instanceUrl as string;
        session.user.shozokuTenpoId = token.shozokuTenpoId as string;
      }

      return session;
    }
  },
  pages: {
    signIn: "/login",
    error: "/login"
  },
  debug: process.env.NODE_ENV === 'development'
};

export default NextAuth(authOptions);