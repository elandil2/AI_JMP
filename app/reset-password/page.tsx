"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
    const supabase = getSupabaseBrowserClient();
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Optional: Check if we have a session. 
    // The link from email should automatically sign the user in via hash fragment if using supabase-js client side
    // But it might take a moment to initialize.

    useEffect(() => {
        // We can listen to auth state changes to detect if the session is established from the recovery link
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === "PASSWORD_RECOVERY") {
                // User is signed in via recovery link
                // We are good to go
            }
        });

        return () => {
            subscription.unsubscribe();
        }
    }, [supabase]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        if (password !== confirmPassword) {
            setMessage({ type: 'error', text: "Şifreler eşleşmiyor." });
            setLoading(false);
            return;
        }

        if (password.length < 6) {
            setMessage({ type: 'error', text: "Şifre en az 6 karakter olmalıdır." });
            setLoading(false);
            return;
        }

        const { error } = await supabase.auth.updateUser({
            password: password
        });

        if (error) {
            setMessage({ type: 'error', text: error.message });
        } else {
            setMessage({
                type: 'success',
                text: "Şifreniz başarıyla güncellendi. Giriş sayfasına yönlendiriliyorsunuz..."
            });
            // Redirect after a short delay
            setTimeout(() => {
                router.push("/login");
            }, 2000);
        }
        setLoading(false);
    };

    return (
        <main className="flex h-screen w-full flex-col lg:flex-row font-sans text-gray-900 bg-white">
            {/* Left Side - The Photo (Reusing same style for consistency) */}
            <div className="relative flex-1 min-h-[300px] lg:min-h-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1519817914152-22d216bb9170?auto=format&fit=crop&w=1920&q=80')" }}>
                <div className="absolute inset-0 bg-black/20"></div>
            </div>

            {/* Right Side - The Form */}
            <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-16 bg-white">
                <div className="w-full max-w-[400px]">
                    <div className="mb-8">
                        <Link href="/" className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1">
                            ← Giriş'e Dön
                        </Link>
                    </div>

                    <h1 className="font-semibold text-[2.25rem] mb-2 tracking-tight text-gray-900">Yeni Şifre Belirle</h1>
                    <p className="text-gray-500 mb-12 text-base">Lütfen hesabınız için yeni bir şifre girin.</p>

                    <form onSubmit={handleSubmit}>
                        <div className="mb-6">
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Yeni Şifre</label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full p-3.5 border border-gray-200 rounded-lg text-base transition-all bg-gray-50 focus:outline-none focus:border-gray-700 focus:bg-white focus:ring-4 focus:ring-gray-700/10 placeholder-gray-400"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <div className="mb-6">
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">Yeni Şifre (Tekrar)</label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full p-3.5 border border-gray-200 rounded-lg text-base transition-all bg-gray-50 focus:outline-none focus:border-gray-700 focus:bg-white focus:ring-4 focus:ring-gray-700/10 placeholder-gray-400"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {message && (
                            <div className={`text-sm px-4 py-3 rounded-lg mb-6 ${message.type === 'error' ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                                {message.text}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full p-3.5 bg-gray-900 text-white border-none rounded-lg text-base font-semibold cursor-pointer transition hover:bg-gray-700 disabled:opacity-70"
                        >
                            {loading ? "Güncelleniyor..." : "Şifreyi Güncelle"}
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
