// app/layout.tsx
import './globals.css';
import Navbar from './components/Navbar';

export const metadata = {
  title: 'Kereke Hub | Ministry Management, Simplified',
  description: 'Affordable, secure multi-tenant administration for growing churches.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-900 text-slate-100 font-sans antialiased">

        <Navbar />

        {/* --- MAIN PAGE CONTENT --- */}
        <main>{children}</main>

        {/* --- GLOBAL FOOTER --- */}
        <footer className="bg-slate-950 border-t border-slate-900 py-12 text-slate-500 text-xs font-medium">
          <div className="container mx-auto px-6 text-center space-y-4">
            <p>&copy; {new Date().getFullYear()} KerekeHub. All rights reserved.</p>
            <p>Ministry Management, Simplified. Sited on kerekehub.co.za</p>
          </div>
        </footer>

      </body>
    </html>
  );
}
