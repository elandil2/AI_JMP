"use client";

import { useState } from "react";
import { authFetch } from "@/lib/apiClient";
import { useRouter } from "next/navigation";

export interface Profile {
    id: string;
    email: string;
    name?: string;
    created_at: string;
    is_admin: boolean;
    is_blocked: boolean;
}

interface AdminDashboardProps {
    initialUsers: Profile[];
    reportCount: number;
    batchCount: number;
}

export default function AdminDashboard({ initialUsers, reportCount, batchCount }: AdminDashboardProps) {
    const [users, setUsers] = useState<Profile[]>(initialUsers);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const router = useRouter();

    const toggleStatus = async (userId: string, field: 'is_blocked' | 'is_admin', currentValue: boolean) => {
        setLoadingId(userId);
        const newValue = !currentValue;

        try {
            const response = await authFetch(`/api/admin/users/${userId}`, {
                method: 'PATCH',
                body: JSON.stringify({ field, value: newValue }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to update");
            }

            // Update local state
            setUsers(users.map(u => u.id === userId ? { ...u, [field]: newValue } : u));
            router.refresh(); // Refresh server data
        } catch (err: any) {
            alert(`Error updating user: ${err.message}`);
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                    <span className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Users</span>
                    <span className="text-3xl font-bold text-gray-900 mt-2">{users.length}</span>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                    <span className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Reports</span>
                    <span className="text-3xl font-bold text-gray-900 mt-2">{reportCount}</span>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                    <span className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Batches</span>
                    <span className="text-3xl font-bold text-gray-900 mt-2">{batchCount}</span>
                </div>
            </div>

            {/* User Management */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-900">Registered Users</h2>
                    <span className="text-sm text-gray-500">Manage access and roles</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-gray-900 font-semibold border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4">User Info</th>
                                <th className="px-6 py-4">Joined</th>
                                <th className="px-6 py-4 text-center">Role</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-gray-900">{user.email}</span>
                                            <span className="text-xs text-gray-400 font-mono mt-0.5">{user.id}</span>
                                            {user.name && <span className="text-xs text-gray-500">{user.name}</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {new Date(user.created_at).toLocaleDateString("tr-TR", {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric'
                                        })}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.is_admin
                                            ? 'bg-purple-100 text-purple-800'
                                            : 'bg-gray-100 text-gray-800'
                                            }`}>
                                            {user.is_admin ? 'Admin' : 'User'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.is_blocked
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-green-100 text-green-800'
                                            }`}>
                                            {user.is_blocked ? 'Blocked' : 'Active'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => toggleStatus(user.id, 'is_blocked', user.is_blocked || false)}
                                                disabled={loadingId === user.id}
                                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${user.is_blocked
                                                    ? 'bg-white border-green-200 text-green-700 hover:bg-green-50'
                                                    : 'bg-white border-red-200 text-red-700 hover:bg-red-50'
                                                    } disabled:opacity-50`}
                                            >
                                                {user.is_blocked ? 'Unblock' : 'Block'}
                                            </button>

                                            <button
                                                onClick={() => toggleStatus(user.id, 'is_admin', user.is_admin || false)}
                                                disabled={loadingId === user.id}
                                                className="px-3 py-1.5 rounded text-xs font-medium transition-colors border bg-white border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                {user.is_admin ? 'Remove Admin' : 'Make Admin'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
