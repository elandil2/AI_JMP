"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function SettingsPage() {
    const [user, setUser] = useState<{ id: string; email: string; name?: string } | null>(null);
    const [loading, setLoading] = useState(true);

    // Form States
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Loading States
    const [updatingName, setUpdatingName] = useState(false);
    const [updatingEmail, setUpdatingEmail] = useState(false);
    const [updatingPass, setUpdatingPass] = useState(false);

    // Messages
    const [nameMsg, setNameMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [emailMsg, setEmailMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [passMsg, setPassMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const supabase = getSupabaseBrowserClient();

    useEffect(() => {
        const fetchProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setLoading(false);
                return;
            }

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
            setName(profile?.name || "");
            setEmail(user.email || "");
            setLoading(false);
        };

        fetchProfile();
    }, []);

    const handleUpdateName = async (e: React.FormEvent) => {
        e.preventDefault();
        setUpdatingName(true);
        setNameMsg(null);

        if (!user) return;

        try {
            const { error: dbError } = await supabase
                .from("profiles")
                .upsert({ id: user.id, email: user.email, name });

            if (dbError) throw dbError;

            // Update Auth metadata
            const { error: authError } = await supabase.auth.updateUser({
                data: { full_name: name }
            });

            if (authError) throw authError;

            setNameMsg({ type: 'success', text: "İsim başarıyla güncellendi." });

            // Refresh local state
            setUser({ ...user, name });

            // Optional: Reload to update header immediately
            window.location.reload();

        } catch (error: any) {
            setNameMsg({ type: 'error', text: error.message });
        } finally {
            setUpdatingName(false);
        }
    };

    const handleUpdateEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setUpdatingEmail(true);
        setEmailMsg(null);

        if (!email) {
            setEmailMsg({ type: 'error', text: "E-posta adresi boş olamaz." });
            setUpdatingEmail(false);
            return;
        }

        try {
            const { error } = await supabase.auth.updateUser({ email });
            if (error) throw error;

            setEmailMsg({ type: 'success', text: "Onay bağlantısı yeni e-posta adresinize gönderildi. Lütfen gelen kutunuzu kontrol edin." });
        } catch (error: any) {
            setEmailMsg({ type: 'error', text: error.message });
        } finally {
            setUpdatingEmail(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setUpdatingPass(true);
        setPassMsg(null);

        if (password !== confirmPassword) {
            setPassMsg({ type: 'error', text: "Şifreler eşleşmiyor." });
            setUpdatingPass(false);
            return;
        }

        if (password.length < 6) {
            setPassMsg({ type: 'error', text: "Şifre en az 6 karakter olmalıdır." });
            setUpdatingPass(false);
            return;
        }

        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;

            setPassMsg({ type: 'success', text: "Şifreniz başarıyla güncellendi." });
            setPassword("");
            setConfirmPassword("");
        } catch (error: any) {
            setPassMsg({ type: 'error', text: error.message });
        } finally {
            setUpdatingPass(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-500">Yükleniyor...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <Header />
            <main className="px-6 py-12 mx-auto max-w-3xl space-y-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Hesap Ayarları</h1>
                    <p className="text-slate-500 mt-2">Kişisel bilgilerinizi ve güvenlik ayarlarınızı yönetin.</p>
                </div>

                {/* Profil Bilgileri */}
                <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                    <h2 className="text-xl font-bold text-slate-900 mb-6">Profil Bilgileri</h2>
                    <form onSubmit={handleUpdateName} className="space-y-4 max-w-md">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Görünen Ad</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Adınız Soyadınız"
                            />
                        </div>
                        {nameMsg && (
                            <div className={`text-sm px-4 py-3 rounded-xl ${nameMsg.type === 'error' ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                                {nameMsg.text}
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={updatingName}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-6 py-2.5 transition disabled:opacity-70"
                        >
                            {updatingName ? "Kaydediliyor..." : "Kaydet"}
                        </button>
                    </form>
                </section>

                {/* E-posta Güncelleme */}
                <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                    <h2 className="text-xl font-bold text-slate-900 mb-6">E-posta Adresi</h2>
                    <form onSubmit={handleUpdateEmail} className="space-y-4 max-w-md">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Yeni E-posta</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-xs text-slate-500 mt-2">Değişikliği onaylamak için her iki adrese de bir e-posta gönderilecektir.</p>
                        </div>
                        {emailMsg && (
                            <div className={`text-sm px-4 py-3 rounded-xl ${emailMsg.type === 'error' ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                                {emailMsg.text}
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={updatingEmail}
                            className="bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl px-6 py-2.5 transition disabled:opacity-70"
                        >
                            {updatingEmail ? "Güncelleniyor..." : "E-posta Güncelle"}
                        </button>
                    </form>
                </section>

                {/* Şifre Değiştirme */}
                <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                    <h2 className="text-xl font-bold text-slate-900 mb-6">Şifre Değiştir</h2>
                    <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Yeni Şifre</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="••••••••"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Şifre Tekrar</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="••••••••"
                            />
                        </div>
                        {passMsg && (
                            <div className={`text-sm px-4 py-3 rounded-xl ${passMsg.type === 'error' ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                                {passMsg.text}
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={updatingPass}
                            className="bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl px-6 py-2.5 transition disabled:opacity-70"
                        >
                            {updatingPass ? "Güncelleniyor..." : "Şifreyi Güncelle"}
                        </button>
                    </form>
                </section>
            </main>
        </div>
    );
}
