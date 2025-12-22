import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  
  // embed=trueパラメータを検知
  const embedParam = request.nextUrl.searchParams.get('embed')
  
  // embed=trueの場合、X-Frame-Optionsヘッダーを削除（埋め込みを許可）
  if (embedParam === 'true') {
    response.headers.delete('X-Frame-Options')
  }
  
  return response
}

export const config = {
  matcher: [
    '/book/:path*',
    '/candidate/:path*',
    '/interview/:path*',
  ],
}
