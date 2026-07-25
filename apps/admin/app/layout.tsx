import './globals.css';
import AdminShell from './_components/admin-shell';

export default function AdminLayout({ children }) {
  return <html lang="ko"><body><AdminShell>{children}</AdminShell></body></html>;
}
