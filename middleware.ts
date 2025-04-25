import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// セキュリティヘッダーを設定する関数
function setSecurityHeaders(response: NextResponse) {
  // Content Security Policy
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.salesforce.com;"
  );

  // XSS Protection
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Content Type Options
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Frame Options
  response.headers.set('X-Frame-Options', 'DENY');

  // Referrer Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  return response;
}

// ミドルウェアの設定を修正
export default withAuth(
  function middleware(req) {
    const response = NextResponse.next();
    return setSecurityHeaders(response);
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // トークンの有効性を厳密にチェック
        if (!token) return false;
        if (typeof token.exp !== 'number') return false;
        if (Date.now() >= token.exp * 1000) return false;
        if (!token.accessToken || !token.instanceUrl || !token.shozokuTenpoId) return false;
        return true;
      },
    },
  }
);

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login).*)",
  ],
};