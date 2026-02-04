"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
    const supabase = getSupabaseBrowserClient();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        // 1. Check if email exists in DB
        const checkRes = await fetch("/api/check-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });

        if (!checkRes.ok) {
            // Fallback if API fails, just proceed to be safe or show generic error
            console.warn("Email check failed");
        } else {
            const { exists } = await checkRes.json();
            if (!exists) {
                setMessage({ type: 'error', text: "Bu e-posta adresi ile kayıtlı bir kullanıcı bulunamadı." });
                setLoading(false);
                return;
            }
        }

        const resetCallbackUrl = `${window.location.origin}/reset-password`;

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: resetCallbackUrl,
        });

        if (error) {
            setMessage({ type: 'error', text: error.message });
        } else {
            setMessage({
                type: 'success',
                text: "Şifre sıfırlama bağlantısı e-posta adresinize gönderildi. Lütfen gelen kutunuzu kontrol edin."
            });
            setEmail("");
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
                    <div className="mb-8">
                        <Link href="/" className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1">
                            ← Giriş'e Dön
                        </Link>
                    </div>

                    <h1 className="font-semibold text-[2.25rem] mb-2 tracking-tight text-gray-900">Şifremi Unuttum</h1>
                    <p className="text-gray-500 mb-12 text-base">E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim.</p>

                    <form onSubmit={handleSubmit}>
                        <div className="mb-6">
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">E-posta Adresi</label>
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
                            {loading ? "Gönderiliyor..." : "Sıfırlama Bağlantısı Gönder"}
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
