import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Intercept requests directed to the dashboard routes
  if (pathname.startsWith('/dashboard')) {
    // Read the secure session cookie we set during the login/signup API step
    const session = request.cookies.get('session')?.value;

    // If the cookie is absent or structurally empty, redirect straight to the signup page
    if (!session) {
      const loginUrl = new URL('/signup', request.url);
      
      // Optional: Pass the original path as a query param so you can redirect back later
      loginUrl.searchParams.set('from', pathname);
      
      return NextResponse.redirect(loginUrl);
    }
  }

  // Allow the request to pass through if the session exists or it's a public route
  return NextResponse.next();
}

// This config restricts the middleware so it only runs on your protected dashboard routes
export const config = {
  matcher: [
    '/dashboard/:path*',
  ],
};