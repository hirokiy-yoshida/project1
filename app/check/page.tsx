"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CheckPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [salesforceStatus, setSalesforceStatus] = useState<string>("確認中...");

  useEffect(() => {
    const checkSalesforceConnection = async () => {
      if (session?.user?.instanceUrl && session?.user?.accessToken) {
        try {
          const response = await fetch(`${session.user.instanceUrl}/services/oauth2/userinfo`, {
            headers: {
              Authorization: `Bearer ${session.user.accessToken}`
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            setSalesforceStatus(`接続済み (${data.name})`);
          } else {
            if ((session as any).error === "RefreshAccessTokenError") {
              setSalesforceStatus("トークンの更新に失敗しました。再度ログインしてください。");
            } else {
              setSalesforceStatus("接続エラー");
            }
          }
        } catch (error) {
          setSalesforceStatus("接続エラー");
        }
      }
    };

    checkSalesforceConnection();
  }, [session]);

  if (status === "loading") {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold text-gray-600">読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">認証状態の確認</h1>
        
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">セッション状態</h2>
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm text-gray-600">
                ステータス: <span className="font-medium">{status}</span>
              </p>
              {session && (
                <>
                  <p className="text-sm text-gray-600 mt-2">
                    ユーザー名: <span className="font-medium">{session.user?.name || "不明"}</span>
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    メール: <span className="font-medium">{session.user?.email || "不明"}</span>
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    所属店舗Id: <span className="font-medium">{session.user?.shozokuTenpoId || "未設定"}</span>
                  </p>
                </>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Salesforce接続状態</h2>
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm text-gray-600">
                状態: <span className="font-medium">{salesforceStatus}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end space-x-4">
          {(session as any).error === "RefreshAccessTokenError" && (
            <button
              onClick={() => router.push("/login")}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              再ログイン
            </button>
          )}
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    </div>
  );
}