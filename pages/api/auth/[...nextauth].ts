import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import axios from 'axios';
import https from 'https';

// 環境変数の検証
const requiredEnvVars = [
  'SF_CLIENT_ID',
  'SF_CLIENT_SECRET',
  'SF_TOKEN_URL',
  'SF_INSTANCE_URL',
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const CONNECTION_CONFIG = {
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  REQUEST_TIMEOUT: 30000,
  KEEP_ALIVE_MSECS: 3000,
  MAX_SOCKETS: 100,
  MAX_FREE_SOCKETS: 10,
  SOCKET_TIMEOUT: 30000
};

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    keepAlive: true,
    keepAliveMsecs: CONNECTION_CONFIG.KEEP_ALIVE_MSECS,
    maxSockets: CONNECTION_CONFIG.MAX_SOCKETS,
    maxFreeSockets: CONNECTION_CONFIG.MAX_FREE_SOCKETS,
    timeout: CONNECTION_CONFIG.SOCKET_TIMEOUT
  }),
  timeout: CONNECTION_CONFIG.REQUEST_TIMEOUT,
  maxRedirects: 5,
  validateStatus: status => status >= 200 && status < 300
});

const tokenCache = new Map<string, {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}>();

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

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          console.log('Starting authorization process');
          console.log('Environment variables:', {
            SF_CLIENT_ID: process.env.SF_CLIENT_ID ? 'Set' : 'Not Set',
            SF_TOKEN_URL: process.env.SF_TOKEN_URL,
            SF_INSTANCE_URL: process.env.SF_INSTANCE_URL
          });

          if (!credentials?.username || !credentials?.password) {
            console.error('Missing credentials');
            throw new Error('Missing credentials');
          }

          const params = new URLSearchParams({
            grant_type: 'password',
            client_id: process.env.SF_CLIENT_ID!,
            client_secret: process.env.SF_CLIENT_SECRET!,
            username: credentials.username,
            password: credentials.password
          });

          console.log('Attempting to get access token from Salesforce');
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
            console.error('No access token received from Salesforce');
            throw new Error('No access token received');
          }

          console.log('Successfully obtained access token');
          const userInfo = await getUserInfo(response.data.access_token);
          console.log('User info retrieved:', { userId: userInfo.user_id });

          const customField = await fetchUserCustomField(response.data.access_token, userInfo.user_id);
          console.log('Custom field retrieved:', { shozokuTenpoId: customField });

          return {
            id: userInfo.user_id,
            name: userInfo.name,
            email: userInfo.email,
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            instanceUrl: response.data.instance_url,
            shozokuTenpoId: customField
          };
        } catch (error) {
          console.error('Authentication error:', error);
          if (axios.isAxiosError(error)) {
            console.error('Axios error details:', {
              status: error.response?.status,
              data: error.response?.data,
              headers: error.response?.headers
            });
          }
          return null;
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 12 * 60 * 60
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
  debug: true
};

export default NextAuth(authOptions);