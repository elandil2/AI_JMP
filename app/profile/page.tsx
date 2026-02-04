"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function ProfilePage() {
    const [user, setUser] = useState<{ id: string; email: string; name?: string } | null>(null);

    const supabase = getSupabaseBrowserClient();

    useEffect(() => {
        const fetchProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from("profiles")
                .select("name")
                .eq("id", user.id)
                .single();

            setUser({
                id: user.id,
                email: user.email!,
                name: profile?.name
            });
        };

        fetchProfile();
    }, []);

    return (
        <div className="min-h-screen bg-slate-50">
            <Header />
            <main className="px-6 py-12 mx-auto max-w-2xl">
                <h1 className="text-3xl font-bold text-slate-900 mb-8">Profil Bilgileri</h1>

                {user ? (
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="p-8 space-y-8">
                            <div className="flex items-center gap-6 pb-8 border-b border-slate-100">
                                <div className="h-20 w-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-3xl font-bold">
                                    {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900">{user.name || "İsimsiz Kullanıcı"}</h2>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 mt-2">
                                        Operatör
                                    </span>
                                </div>
                            </div>

                            <div className="grid gap-6">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">E-posta</label>
                                    <p className="text-lg text-slate-900 font-medium">{user.email}</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Ad Soyad</label>
                                    <p className="text-lg text-slate-900 font-medium">{user.name || "-"}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                        <p className="mt-4 text-slate-500">Profil yükleniyor...</p>
                    </div>
                )}
            </main>
        </div>
    );
}
