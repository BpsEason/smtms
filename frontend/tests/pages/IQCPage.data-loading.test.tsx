import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { IQCPage } from "../../src/pages/workflow/IQCPage";

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.setItem("smtms_token", "t");
});

function renderPage(permissions: string[]) {
  const profile = {
    id: 1,
    username: "u",
    email: null,
    is_active: true,
    roles: [],
    permissions,
  };
  return render(
    <QueryClientProvider client={createClient()}>
      <MemoryRouter>
        <IQCPage profile={profile as any} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("IQCPage data loading", () => {
  it("loads internal lots via query for iqc:write users and records list", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/internal-lots")) {
        return jsonResponse({ items: [], total: 0, page: 1, page_size: 100 });
      }
      if (url.includes("/api/v1/iqc")) {
        return jsonResponse({ items: [], total: 0, page: 1, page_size: 50 });
      }
      return jsonResponse({}, 404);
    });

    renderPage(["iqc:read", "iqc:write"]);

    await screen.findByText("目前沒有可檢驗的內部批號");
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/api/v1/iqc"))).toBe(true);
      expect(urls.some((u) => u.includes("/api/v1/internal-lots"))).toBe(true);
    });
  });

  it("does not fetch internal lots for read-only users without write permission", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/iqc")) {
        return jsonResponse({ items: [], total: 0, page: 1, page_size: 50 });
      }
      if (url.includes("/api/v1/internal-lots")) {
        return jsonResponse({ items: [], total: 0, page: 1, page_size: 100 });
      }
      return jsonResponse({}, 404);
    });

    renderPage(["iqc:read"]);

    await screen.findByText("沒有符合的 IQC 紀錄");
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/api/v1/iqc"))).toBe(true);
    expect(urls.some((u) => u.includes("/api/v1/internal-lots"))).toBe(false);
  });
});
