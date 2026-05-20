import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">Welcome to Kereke Hub</h1>
      <p className="mt-4 text-lg">The place where your church ministry starts.</p>
      
      {/* Adding navigation buttons */}
      <div className="mt-8 flex gap-4">
        <Link 
          href="/login" 
          className="rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 transition"
        >
          Login
        </Link>
        <Link 
          href="/signup" 
          className="rounded border border-blue-600 px-6 py-2 text-blue-600 hover:bg-blue-50 transition"
        >
          Sign Up
        </Link>
      </div>
    </main>
  );
}