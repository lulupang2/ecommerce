import './globals.css';

export const metadata = { metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:15173'), title: { default: 'TECHZONE | 테크를 사는 가장 스마트한 방법', template: '%s | TECHZONE' }, description: '노트북, 스마트폰, 오디오, 게이밍 기기를 비교하고 빠르게 구매하는 테크 전문 스토어', openGraph: { type: 'website', locale: 'ko_KR', siteName: 'TECHZONE' } };
export default function RootLayout({ children }) { return <html lang="ko"><body>{children}</body></html>; }
