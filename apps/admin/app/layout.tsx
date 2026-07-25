import './globals.css';
import AdminShell from './_components/admin-shell';

export const metadata = {
  title: { default: 'TECHZONE 관리자', template: '%s | TECHZONE 관리자' },
  description: 'TECHZONE 주문, 상품, 재고, 배송 운영 관리자',
};

export default function AdminLayout({ children }) {
  return <html lang="ko"><body><AdminShell>{children}</AdminShell></body></html>;
}
