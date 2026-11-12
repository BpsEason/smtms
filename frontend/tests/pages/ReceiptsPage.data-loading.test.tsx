import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReceiptsPage } from "../../src/pages/workflow/ReceiptsPage";

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

const profile = {
  id: 1,
  username: "u",
  email: null,
  is_active: true,
  roles: [],
  permissions: [
    "receipts:read",
    "receipts:write",
    "materials:read",
    "iqc:read",
    "suppliers:write",
  ],
};

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

describe("ReceiptsPage data loading", () => {
  it("does not fetch master data on initial render, loads on demand when create dialog opens", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/receipts")) {
        return jsonResponse({ items: [], total: 0, page: 1, page_size: 50 });
      }
      if (url.includes("/api/v1/suppliers")) {
        return jsonResponse({ items: [], total: 0, page: 1, page_size: 100 });
      }
      if (url.includes("/api/v1/materials")) {
        return jsonResponse({ items: [], total: 0, page: 1, page_size: 100 });
      }
      if (url.includes("/api/v1/supplier-lots")) {
        return jsonResponse({ items: [], total: 0, page: 1, page_size: 100 });
      }
      return jsonResponse({}, 404);
    });

    render(
      <QueryClientProvider client={createClient()}>
        <ReceiptsPage profile={profile as any} />
      </QueryClientProvider>,
    );

    await screen.findByText("目前沒有收料紀錄");
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/api/v1/suppliers"))).toBe(false);
    expect(urls.some((u) => u.includes("/api/v1/materials"))).toBe(false);
    expect(urls.some((u) => u.includes("/api/v1/supplier-lots"))).toBe(false);
    expect(urls.filter((u) => u.includes("/api/v1/receipts"))).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "新增收料" }));

    await waitFor(() => {
      const after = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(after.some((u) => u.includes("/api/v1/suppliers"))).toBe(true);
      expect(after.some((u) => u.includes("/api/v1/materials"))).toBe(true);
      expect(after.some((u) => u.includes("/api/v1/supplier-lots"))).toBe(true);
    });
  });
});
