"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
    } else if (data.user) {
      // Check if user exists in profile
      const user = data.user;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!profile) {
        // Create profile if not exists
        await supabase.from('profiles').insert({
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || user.email?.split('@')[0],
          created_at: new Date().toISOString(),
          is_admin: false
        });
      }

      router.refresh();
      router.push("/dashboard");
    }
    setLoading(false);
  };

  return (
    <main className="flex h-screen w-full flex-col lg:flex-row font-sans text-gray-900 bg-white">
      {/* Left Side - The Photo */}
      <div className="relative flex-1 min-h-[300px] lg:min-h-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1519817914152-22d216bb9170?auto=format&fit=crop&w=1920&q=80')" }}>
        <div className="absolute inset-0 bg-black/20"></div>
      </div>

      {/* Right Side - The Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-16 bg-white">
        <div className="w-full max-w-[400px]">
          <h1 className="font-semibold text-[2.25rem] mb-2 tracking-tight text-gray-900">Hoş Geldiniz</h1>
          <p className="text-gray-500 mb-12 text-base">Lütfen hesabınıza giriş yapın.</p>

          <form action="#" method="post" onSubmit={handleSubmit}>
            <div className="mb-6">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Kullanıcı Adı (Email)</label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-lg text-base transition-all bg-gray-50 focus:outline-none focus:border-gray-700 focus:bg-white focus:ring-4 focus:ring-gray-700/10 placeholder-gray-400"
                placeholder="name@example.com"
                required
              />
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Şifre</label>
              <input
                type="password"
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-lg text-base transition-all bg-gray-50 focus:outline-none focus:border-gray-700 focus:bg-white focus:ring-4 focus:ring-gray-700/10 placeholder-gray-400"
                placeholder="••••••••"
                required
              />
              <div className="flex justify-end mt-2">
                <Link href="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-800">
                  Şifremi Unuttum?
                </Link>
              </div>
            </div>

            {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-6">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full p-3.5 bg-gray-900 text-white border-none rounded-lg text-base font-semibold cursor-pointer transition hover:bg-gray-700 disabled:opacity-70"
            >
              {loading ? "Giriş yapılıyor..." : "Giriş"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
