import { describe, expect, it, vi } from "vitest";
import { loadAllPages } from "../../src/lib/data";

type Item = { id: number };

function page(items: Item[], total: number, pageNum = 1, pageSize = 100) {
  return { items, total, page: pageNum, page_size: pageSize };
}

describe("loadAllPages", () => {
  it("fetches only first page when total fits in one page", async () => {
    const list = vi.fn().mockResolvedValue(page([{ id: 1 }, { id: 2 }], 2));
    const items = await loadAllPages(list);
    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ page: 1, page_size: 100 });
  });

  it("fetches subsequent pages sequentially until total reached", async () => {
    const list = vi.fn(async (params: { page?: number; page_size?: number }) => {
      if (params.page === 1) return page([{ id: 1 }], 3, 1, 1);
      if (params.page === 2) return page([{ id: 2 }], 3, 2, 1);
      return page([{ id: 3 }], 3, 3, 1);
    });
    // helper uses fixed pageSize 100 internally; simulate via total/items logic
    const listFixed = vi.fn(async (params: { page?: number }) => {
      if (params.page === 1) return page(Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })), 250);
      if (params.page === 2) return page(Array.from({ length: 100 }, (_, i) => ({ id: 100 + i + 1 })), 250);
      return page(Array.from({ length: 50 }, (_, i) => ({ id: 200 + i + 1 })), 250);
    });
    const items = await loadAllPages(listFixed);
    expect(listFixed).toHaveBeenCalledTimes(3);
    expect(listFixed.mock.calls.map((c) => c[0])).toEqual([
      { page: 1, page_size: 100 },
      { page: 2, page_size: 100 },
      { page: 3, page_size: 100 },
    ]);
    expect(items).toHaveLength(250);
    expect(items[0].id).toBe(1);
    expect(items[249].id).toBe(250);
  });

  it("stops early when accumulated items already reach total", async () => {
    const list = vi.fn(async (params: { page?: number }) => {
      if (params.page === 1) return page([{ id: 1 }, { id: 2 }], 2);
      return page([{ id: 999 }], 2);
    });
    const items = await loadAllPages(list);
    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
