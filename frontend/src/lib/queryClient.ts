import { QueryClient } from "@tanstack/react-query";

/**
 * 共用 QueryClient 實例。
 *
 * 採單例模式提供給 main.tsx（Provider）與 App.tsx（登出時清除快取），
 * 確保登入／登出／账号切換時不會残留前一位使用者的 Query 快取資料。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5分鐘
      retry: 1,
    },
  },
});