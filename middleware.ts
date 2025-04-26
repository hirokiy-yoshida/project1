import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { JWT } from "next-auth/jwt";

// セキュリティヘッダーを設定する関数
function setSecurityHeaders(response: NextResponse) {
  // CORS設定
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? 'https://odersystem-953743a2c841.herokuapp.com'
    : '*';

  response.headers.set('Access-Control-Allow-Origin', allowedOrigins);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Max-Age', '86400');
  response.headers.set('Access-Control-Allow-Credentials', 'true');

  // セキュリティヘッダー
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.salesforce.com;"
  );
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  return response;
}

// ミドルウェアの設定を修正
export default withAuth(
  function middleware(req: NextRequest) {
    // HTTPSへのリダイレクト
    if (process.env.NODE_ENV === 'production' && req.headers.get('x-forwarded-proto') !== 'https') {
      return NextResponse.redirect(
        `https://${req.headers.get('host')}${req.nextUrl.pathname}`,
        301
      );
    }

    const response = NextResponse.next();
    return setSecurityHeaders(response);
  },
  {
    callbacks: {
      authorized: ({ token }: { token: JWT | null }) => {
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