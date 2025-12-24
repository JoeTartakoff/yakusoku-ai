import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: 'swap', // フォント読み込み中の表示改善（FOITを防ぐ）
  preload: true, // 優先的に読み込む
});

// ⭐ PWA 메타데이터 추가
export const metadata: Metadata = {
  title: "YAKUSOKU AI",
  description: "AIを活用したスケジュール調整システム",
  manifest: '/manifest.json',
  themeColor: '#3b82f6',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'YAKUSOKU AI',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'YAKUSOKU AI',
    title: 'YAKUSOKU AI',
    description: 'AIを活用したスケジュール調整システム',
  },
  twitter: {
    card: 'summary',
    title: 'YAKUSOKU AI',
    description: 'AIを活用したスケジュール調整システム',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        {/* ⭐ PWA 관련 메타 태그 */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#3b82f6" />
        
        {/* ⭐ Apple 관련 */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="YAKUSOKU AI" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        
        {/* ⭐ Favicon */}
        <link rel="icon" type="image/png" href="/favicon.png" />
        
        {/* ⭐ 아이콘 */}
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />
        
        {/* ⭐ DNS Prefetch */}
        <link rel="dns-prefetch" href="https://siyhjqjelkfgqznrpoqq.supabase.co" />
        <link rel="dns-prefetch" href="https://www.googleapis.com" />
        <link rel="dns-prefetch" href="https://accounts.google.com" />
        
        {/* ⭐ Preconnect */}
        <link rel="preconnect" href="https://siyhjqjelkfgqznrpoqq.supabase.co" />
        <link rel="preconnect" href="https://www.googleapis.com" crossOrigin="anonymous" />
      </head>
      <body
        className={`${notoSansJP.variable} antialiased`}
      >
        {children}
        
        {/* ⭐ Service Worker 등록 스크립트 */}
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
                  .then(function(registration) {
                    console.log('✅ SW registered:', registration.scope);
                  })
                  .catch(function(error) {
                    console.log('❌ SW registration failed:', error);
                  });
              });
            }
          `
        }} />
      </body>
    </html>
  );
}
