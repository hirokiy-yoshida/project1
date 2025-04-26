"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback } from "react";

type RefreshCallbackProps = {
  onRefresh?: () => Promise<void>;
  isLoading?: boolean;
  lastUpdated?: Date | null;
  onLayoutClick?: () => void;
};

export default function Navbar({
  onRefresh,
  isLoading,
  lastUpdated,
  onLayoutClick,
}: RefreshCallbackProps) {
  const { data: session } = useSession();

  const handleRefresh = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
    }
  }, [onRefresh]);

  return (
    <nav className="bg-white shadow-sm w-full">
      <div className="max-w-full mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Left section */}
          <div className="flex items-center space-x-4">
            <div className="flex-1 text-xl font-semibold">
              ドリンクオーダーシステム
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="inline-flex items-center p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                title="データを更新"
              >
                <svg
                  className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              {lastUpdated && (
                <span className="text-sm text-gray-500">
                  最終更新: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          {/* Center section */}
          {session && (
            <div className="flex items-center">
              <button
                onClick={onLayoutClick}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                店舗レイアウト
              </button>
            </div>
          )}

          {/* Right section */}
          {session && (
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {session.user?.name || "ユーザー"}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
