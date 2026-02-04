"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { LogOut, User, Menu, Settings } from "lucide-react";

export default function Header() {
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();
    const supabase = getSupabaseBrowserClient();

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Fetch profile name
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("name, is_admin")
                    .eq("id", user.id)
                    .single();

                // Use name if exists, else email
                const displayName = profile?.name || user.email || "Kullanıcı";
                setUserEmail(displayName);
                setIsAdmin(!!profile?.is_admin);
            }
        };
        getUser();
    }, [supabase]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/");
    };

    return (
        <header className="sticky top-0 z-50 w-full bg-white border-b border-gray-200 shadow-sm print:hidden">
            <div className="flex h-16 items-center justify-between px-6 max-w-[1400px] mx-auto">
                <div className="flex items-center gap-8">
                    <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl text-gray-900">
                        <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                            J
                        </div>
                        <span>AI JMP</span>
                    </Link>
                    <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
                        <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Dashboard</Link>
                        <Link href="/reports/new" className="hover:text-blue-600 transition-colors">Yeni Rapor</Link>
                        <Link href="/reports/batch" className="hover:text-blue-600 transition-colors">Toplu İşlemler</Link>
                        {isAdmin && (
                            <Link href="/admin" className="text-purple-600 hover:text-purple-700 font-semibold transition-colors">
                                Admin Panel
                            </Link>
                        )}
                    </nav>
                </div>

                <div className="flex items-center gap-4">
                    {userEmail ? (
                        <div className="relative">
                            <button
                                onClick={() => setIsOpen(!isOpen)}
                                className="flex items-center gap-3 pl-4 border-l border-gray-200 hover:opacity-80 transition-opacity"
                            >
                                <div className="flex flex-col items-end hidden sm:flex">
                                    <span className="text-sm font-semibold text-gray-900">{userEmail}</span>
                                    <span className="text-xs text-slate-500">Operatör</span>
                                </div>
                                <div className="h-9 w-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 border border-slate-200 shadow-sm">
                                    <User size={18} />
                                </div>
                            </button>

                            {isOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50">
                                    <div className="px-4 py-2 border-b border-slate-50 sm:hidden">
                                        <p className="text-sm font-semibold text-gray-900 truncate">{userEmail}</p>
                                        <p className="text-xs text-slate-500">Operatör</p>
                                    </div>
                                    <Link
                                        href="/profile"
                                        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        <User size={16} />
                                        <span>Profil</span>
                                    </Link>
                                    <Link
                                        href="/settings"
                                        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        <Settings size={16} />
                                        <span>Ayarlar</span>
                                    </Link>
                                    <div className="my-1 border-t border-slate-100" />
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                                    >
                                        <LogOut size={16} />
                                        <span>Çıkış Yap</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                            <div className="h-9 w-9 bg-gray-100 rounded-full animate-pulse" />
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
