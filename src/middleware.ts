import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  
  const pathname = request.nextUrl.pathname
  const embedParam = request.nextUrl.searchParams.get('embed')
  
  // 埋め込み可能なページ（/book, /candidate, /interview）でembed=trueの場合
  const isEmbeddablePage = pathname.startsWith('/book/') || 
                           pathname.startsWith('/candidate/') || 
                           pathname.startsWith('/interview/')
  
  if (isEmbeddablePage && embedParam === 'true') {
    // embed=trueの場合は、埋め込みを許可
    // Content-Security-Policyのframe-ancestorsで全てのドメインからの埋め込みを許可
    response.headers.delete('X-Frame-Options')
    response.headers.set('Content-Security-Policy', "frame-ancestors *;")
  } else {
    // それ以外の場合は、埋め込みを拒否
    response.headers.set('X-Frame-Options', 'DENY')
  }
  
  return response
}

export const config = {
  matcher: [
    '/book/:path*',
    '/candidate/:path*',
    '/interview/:path*',
    // その他のページにもX-Frame-Optionsを設定するため、すべてのページを対象にする
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|sw.js).*)',
  ],
}
