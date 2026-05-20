export default function LoginPage() {
  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold">Login to Kereke Hub</h1>
      <form className="mt-4 flex flex-col gap-4">
        <input type="email" placeholder="Email" className="border p-2" />
        <input type="password" placeholder="Password" className="border p-2" />
        <button type="submit" className="bg-blue-500 text-white p-2">Login</button>
      </form>
    </div>
  );
}