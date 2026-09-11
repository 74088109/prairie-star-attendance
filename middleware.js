import { NextResponse } from 'next/server';
import { COOKIE_NAME, verifySessionToken } from './lib/auth';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(req) {
  const { pathname, searchParams } = req.nextUrl;

  // Always allow the login page and the login action so people can actually log in.
  if (pathname === '/login') return NextResponse.next();
  if (pathname === '/api' && searchParams.get('action') === 'login') return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const ok = await verifySessionToken(token);
  if (ok) return NextResponse.next();

  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}
