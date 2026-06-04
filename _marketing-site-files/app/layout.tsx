// app/layout.tsx
import './globals.css';
import Navbar from './components/Navbar';

export const metadata = {
  title: 'Church Management Software for South Africa | Kereke Hub',
  description: 'Manage members, attendance, finances & visitors in one platform. Free first month for South African churches. No per-seat pricing.',
  keywords: 'church management software South Africa, church administration platform, church roster software, attendance tracking',
  canonical: 'https://kerekehub.co.za',
  openGraph: {
    title: 'Church Management Software for South Africa | Kereke Hub',
    description: 'Manage members, attendance, finances & visitors in one platform. Free first month for South African churches.',
    url: 'https://kerekehub.co.za',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Schema.org structured data for Organization and SoftwareApplication
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Kereke Hub",
    "url": "https://kerekehub.co.za",
    "logo": "https://kerekehub.co.za/logo.png",
    "description": "Church management software for South African congregations",
    "sameAs": [
      "https://www.linkedin.com/company/kereke-hub",
      "https://facebook.com/kerekehub"
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "Customer Support",
      "email": "support@kerekehub.co.za"
    }
  };

  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Kereke Hub",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "url": "https://kerekehub.co.za",
    "description": "Church management software for member rosters, attendance tracking, financial management, and visitor follow-up",
    "offers": {
      "@type": "Offer",
      "price": "159",
      "priceCurrency": "ZAR",
      "url": "https://kerekehub.co.za/pricing"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "12",
      "bestRating": "5",
      "worstRating": "1"
    }
  };

  return (
    <html lang="en">
      <head>
        {/* Organization schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        {/* SoftwareApplication schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
        />
      </head>
      <body className="bg-slate-900 text-slate-100 font-sans antialiased">

        <Navbar />

        {/* --- MAIN PAGE CONTENT --- */}
        <main>{children}</main>

        {/* --- GLOBAL FOOTER --- */}
        <footer className="bg-slate-950 border-t border-slate-900 py-12 text-slate-500 text-xs font-medium">
          <div className="container mx-auto px-6 text-center space-y-4">
            <p>&copy; {new Date().getFullYear()} KerekeHub. All rights reserved.</p>
            <p>Church management software for South African churches. Sited on kerekehub.co.za</p>
          </div>
        </footer>

      </body>
    </html>
  );
}
