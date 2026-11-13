import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  api,
  ApiError,
  readToken,
  saveToken,
  clearToken,
} from "../../src/api";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const API_BASE_URL = "http://localhost:8000";

describe("API Client Error Handling", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    clearToken();
    // 清除所有事件監聽器
    vi.clearAllMocks();
  });

  it("應該正確解析Laravel 422驗證錯誤格式", async () => {
    const validationErrors = {
      name: ["名稱不能為空"],
      email: ["email格式不正確", "email已經被使用"],
    };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve(JSON.stringify({ errors: validationErrors })),
    });

    try {
      await api.listSuppliers();
      // 如果沒有拋出錯誤，測試失敗
      expect.unreachable("應該拋出ApiError");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as ApiError).message).toBe(
        "名稱不能為空; email格式不正確; email已經被使用",
      );
      expect((error as ApiError).status).toBe(422);
      expect((error as ApiError).errors).toEqual(validationErrors);
    }
  });

  it("應該正確處理401未授權並清除token觸發事件", async () => {
    saveToken("test-token");
    expect(readToken()).toBe("test-token");

    // 監聽unauthorized事件
    const unauthorizedHandler = vi.fn();
    window.addEventListener("smtms:unauthorized", unauthorizedHandler);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(""), // 不返回detail，讓client使用預設的錯誤訊息
    });

    await expect(api.listSuppliers()).rejects.toThrow("未授權，請重新登入");
    expect(readToken()).toBeNull();
    expect(unauthorizedHandler).toHaveBeenCalled();

    window.removeEventListener("smtms:unauthorized", unauthorizedHandler);
  });

  it("登入請求時遇到401不應該清除token", async () => {
    saveToken("test-token");
    expect(readToken()).toBe("test-token");

    const unauthorizedHandler = vi.fn();
    window.addEventListener("smtms:unauthorized", unauthorizedHandler);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () =>
        Promise.resolve(JSON.stringify({ detail: "Invalid credentials" })),
    });

    await expect(api.login("test", "test")).rejects.toThrow(
      "Invalid credentials",
    );
    expect(readToken()).toBe("test-token"); // 不應該清除
    expect(unauthorizedHandler).not.toHaveBeenCalled();

    window.removeEventListener("smtms:unauthorized", unauthorizedHandler);
  });

  it("應該正確處理403禁止訪問", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve(""),
    });

    await expect(api.listSuppliers()).rejects.toThrow("您沒有權限執行此操作");
  });

  it("應該正確處理404找不到資源", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve(""),
    });

    await expect(api.getNonconformance(999)).rejects.toThrow(
      "要求的資源不存在",
    );
  });

  it("應該正確處理500伺服器錯誤", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve(""),
    });

    await expect(api.listSuppliers()).rejects.toThrow(
      "伺服器內部錯誤，請稍後再試",
    );
  });

  it("應該保留message字段的錯誤訊息", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ message: "自訂錯誤訊息" })),
    });

    await expect(api.listSuppliers()).rejects.toThrow("自訂錯誤訊息");
  });

  it("blob下載方法也應該正確處理401", async () => {
    saveToken("test-token");
    const unauthorizedHandler = vi.fn();
    window.addEventListener("smtms:unauthorized", unauthorizedHandler);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(""),
    });

    await expect(api.exportAuditLogs()).rejects.toThrow("稽核紀錄匯出失敗");
    expect(readToken()).toBeNull();
    expect(unauthorizedHandler).toHaveBeenCalled();

    window.removeEventListener("smtms:unauthorized", unauthorizedHandler);
  });
});

describe("API Client Token Refresh", () => {
  const refreshUrl = `${API_BASE_URL}/api/v1/auth/refresh`;

  beforeEach(() => {
    mockFetch.mockClear();
    clearToken();
    vi.clearAllMocks();
  });

  function refreshCallCount(): number {
    return (mockFetch.mock.calls ?? []).filter((call) =>
      String(call[0]).includes("/auth/refresh"),
    ).length;
  }

  it("多個同時 401 僅執行一次 refresh (single-flight)", async () => {
    saveToken("access-token");
    localStorage.setItem("smtms_refresh_token", "refresh-token");
    const unauthorizedHandler = vi.fn();
    window.addEventListener("smtms:unauthorized", unauthorizedHandler);

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(""),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(""),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({ access_token: "new-access", refresh_token: "new-rt" }),
          ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve("{}"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve("{}"),
      });

    await Promise.all([api.listSuppliers(), api.listSuppliers()]);

    expect(refreshCallCount()).toBe(1);
    expect(readToken()).toBe("new-access");
    expect(unauthorizedHandler).not.toHaveBeenCalled();

    window.removeEventListener("smtms:unauthorized", unauthorizedHandler);
  });

  it("refresh 失敗時清除 token 且僅觸發一次 unauthorized", async () => {
    saveToken("access-token");
    localStorage.setItem("smtms_refresh_token", "refresh-token");
    const unauthorizedHandler = vi.fn();
    window.addEventListener("smtms:unauthorized", unauthorizedHandler);

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(""),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve(""),
      });

    await expect(api.listSuppliers()).rejects.toThrow("未授權，請重新登入");
    expect(readToken()).toBeNull();
    expect(localStorage.getItem("smtms_refresh_token")).toBeNull();
    expect(refreshCallCount()).toBe(1);
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);

    window.removeEventListener("smtms:unauthorized", unauthorizedHandler);
  });

  it("重試後再遇 401 僅刷新一次並清除 token", async () => {
    saveToken("access-token");
    localStorage.setItem("smtms_refresh_token", "refresh-token");
    const unauthorizedHandler = vi.fn();
    window.addEventListener("smtms:unauthorized", unauthorizedHandler);

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(""),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ access_token: "new-access" })),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(""),
      });

    await expect(api.listSuppliers()).rejects.toThrow("未授權，請重新登入");
    expect(readToken()).toBeNull();
    expect(refreshCallCount()).toBe(1);
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);

    window.removeEventListener("smtms:unauthorized", unauthorizedHandler);
  });
});
