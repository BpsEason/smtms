import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RolesPermissionsPage } from "../../src/pages/AdminPage";
import type { UserProfile } from "../../src/types";

const fetchMock = vi.fn();

const managerProfile: UserProfile = {
  id: 1,
  username: "admin-one",
  email: "admin-one@example.test",
  is_active: true,
  roles: ["access-admin"],
  permissions: ["users:manage"],
};

const adminRole = {
  id: 1,
  name: "access-admin",
  description: "Access administrator",
  permissions: ["users:manage"],
  user_count: 2,
  is_system: false,
};

const readerRole = {
  id: 2,
  name: "qc-reader",
  description: "Read-only QC",
  permissions: ["iqc:read"],
  user_count: 1,
  is_system: false,
};

const permissions = [
  { id: 10, code: "users:manage", name: "管理使用者", description: null },
  { id: 11, code: "iqc:read", name: "讀取 IQC", description: null },
  { id: 12, code: "nonconformance:read", name: "Read quality nonconformance cases", description: "Seed permission: Read quality nonconformance cases" },
  { id: 13, code: "nonconformance:write", name: "Manage quality nonconformance cases", description: "Seed permission: Manage quality nonconformance cases" },
  { id: 14, code: "quality:review", name: "Review incoming inspections", description: "Seed permission: Review incoming inspections" },
  { id: 15, code: "quality:approve", name: "Approve incoming inspections", description: "Seed permission: Approve incoming inspections" },
  { id: 16, code: "quality:return", name: "Return incoming inspections for correction", description: "Seed permission: Return incoming inspections for correction" },
  { id: 17, code: "supplier-lots:write", name: "Create supplier lots", description: "Seed permission: Create supplier lots" },
  { id: 18, code: "receipts:write", name: "Create material receipts", description: "Seed permission: Create material receipts" },
  { id: 19, code: "legacy:custom", name: "Seed permission: Legacy custom permission", description: "Seed permission: Legacy custom permission" },
];

const users = [
  {
    id: 3,
    username: "staff",
    email: "staff@example.test",
    is_active: true,
    roles: ["qc-reader"],
  },
];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function installMock(
  overrides: {
    roles?: Response;
    permissions?: Response;
    users?: Response;
    createRole?: Response;
    createUser?: Response;
    savePermissions?: Response;
    saveUserRoles?: Response;
  } = {},
) {
  const currentUsers = [...users];
  const createdUser = {
    id: 4,
    username: "new-staff",
    email: "new-staff@example.test",
    is_active: true,
    roles: ["qc-reader"],
  };
  fetchMock.mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/v1/roles") && method === "POST")
        return overrides.createRole ?? jsonResponse(adminRole, 201);
      if (url.endsWith("/api/v1/roles") && method === "GET")
        return overrides.roles ?? jsonResponse([adminRole, readerRole]);
      if (url.endsWith("/api/v1/permissions"))
        return overrides.permissions ?? jsonResponse(permissions);
      if (url.endsWith("/api/v1/users") && method === "POST") {
        const response = overrides.createUser ?? jsonResponse(createdUser, 201);
        if (response.ok) currentUsers.push(createdUser);
        return response;
      }
      if (url.endsWith("/api/v1/users") && method === "GET")
        return overrides.users ?? jsonResponse(currentUsers);
      if (url.endsWith("/permissions") && method === "PUT")
        return overrides.savePermissions ?? jsonResponse(adminRole);
      if (url.includes("/api/v1/users/") && method === "PUT")
        return overrides.saveUserRoles ?? jsonResponse(users[0]);
      return jsonResponse({ detail: "unexpected" }, 500);
    },
  );
}

async function renderPage(profile: UserProfile = managerProfile) {
  render(<RolesPermissionsPage profile={profile} />);
  await screen.findByText("access-admin");
}

function findCall(pathSuffix: string, method: string) {
  const call = fetchMock.mock.calls.find(
    ([url, init]) =>
      String(url).endsWith(pathSuffix) && init?.method === method,
  );
  return call ? { init: call[1] as RequestInit | undefined } : null;
}

describe("roles and permissions admin page", () => {
  it("shows an access notice without the users:manage permission", () => {
    installMock();
    render(
      <RolesPermissionsPage
        profile={{ ...managerProfile, permissions: ["suppliers:read"] }}
      />,
    );
    expect(screen.getByText("無法存取此功能")).toBeInTheDocument();
  });

  it("loads roles, permissions, and internal users", async () => {
    installMock();
    await renderPage();
    expect(screen.getAllByText("qc-reader").length).toBeGreaterThan(0);
    expect(screen.getByText("staff")).toBeInTheDocument();
    expect(screen.getByText("管理使用者與系統設定")).toBeInTheDocument();
  });

  it("creates a role through the API", async () => {
    installMock();
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "新增角色" }));
    await userEvent.type(screen.getByLabelText("角色名稱"), "qc-lead");
    await userEvent.type(screen.getByLabelText("角色說明"), "Quality lead");
    await userEvent.click(screen.getByRole("button", { name: "建立角色" }));

    expect(await screen.findByText("角色已建立。")).toBeInTheDocument();
    const call = findCall("/api/v1/roles", "POST");
    expect(call).toBeTruthy();
    expect(String(call?.init?.body)).toContain("qc-lead");
  });

  it("saves role permissions with the selected permission ids", async () => {
    installMock();
    await renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: "設定權限 access-admin" }),
    );
    expect(screen.getByText("品質異常")).toBeInTheDocument();
    expect(screen.getByLabelText("查看品質異常")).toBeInTheDocument();
    expect(screen.getByLabelText("新增／修改品質異常")).toBeInTheDocument();
    expect(screen.getByText("審核進料檢驗")).toBeInTheDocument();
    expect(screen.getByText("核准進料檢驗")).toBeInTheDocument();
    expect(screen.getByText("退回進料檢驗")).toBeInTheDocument();
    expect(screen.getByText("建立供應商批號")).toBeInTheDocument();
    expect(screen.getByText("建立收料紀錄")).toBeInTheDocument();
    expect(screen.getByText("Legacy custom permission")).toBeInTheDocument();
    expect(screen.queryByText(/Seed permission:/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("讀取 IQC"));
    await userEvent.click(screen.getByLabelText("查看品質異常"));
    await userEvent.click(screen.getByRole("button", { name: "儲存權限" }));

    expect(
      await screen.findByText("角色「access-admin」的權限已更新。"),
    ).toBeInTheDocument();
    const call = findCall("/api/v1/roles/1/permissions", "PUT");
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      permission_ids: [10, 11, 12],
    });
  });

  it("assigns roles to an internal user", async () => {
    installMock();
    await renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: "指派角色 staff" }),
    );
    await userEvent.click(screen.getByLabelText("角色 access-admin"));
    await userEvent.click(screen.getByRole("button", { name: "儲存角色指派" }));

    expect(await screen.findByText("使用者角色已更新。")).toBeInTheDocument();
    const call = findCall("/api/v1/users/3/roles", "PUT");
    expect(call).toBeTruthy();
    const body = JSON.parse(String(call?.init?.body)) as { role_ids: number[] };
    expect([...body.role_ids].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("creates an internal user with roles and refreshes the list", async () => {
    installMock();
    await renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: "新增內部使用者" }),
    );
    await userEvent.type(screen.getByLabelText("登入帳號"), "new-staff");
    await userEvent.type(
      screen.getByLabelText("電子郵件（選填）"),
      "new-staff@example.test",
    );
    await userEvent.type(
      screen.getByLabelText("初始密碼"),
      "New-Internal-Password-2026!",
    );
    await userEvent.click(screen.getByLabelText("新使用者角色 qc-reader"));
    await userEvent.click(
      screen.getByRole("button", { name: "建立內部使用者" }),
    );

    expect(
      await screen.findByText("內部使用者已建立並完成角色指派。"),
    ).toBeInTheDocument();
    expect(await screen.findByText("new-staff")).toBeInTheDocument();
    const call = findCall("/api/v1/users", "POST");
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      username: "new-staff",
      email: "new-staff@example.test",
      password: "New-Internal-Password-2026!",
      role_ids: [2],
    });
    expect(
      screen.queryByRole("button", { name: "建立內部使用者" }),
    ).not.toBeInTheDocument();
  });

  it("surfaces API errors without reporting success", async () => {
    installMock({
      createRole: jsonResponse({ detail: "會移除最後一位管理員。" }, 409),
    });
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "新增角色" }));
    await userEvent.type(screen.getByLabelText("角色名稱"), "blocked");
    await userEvent.click(screen.getByRole("button", { name: "建立角色" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失敗：會移除最後一位管理員。",
    );
    expect(screen.queryByText("角色已建立。")).not.toBeInTheDocument();
  });

  it("surfaces internal-user creation errors", async () => {
    installMock({ createUser: jsonResponse({ detail: "Username already exists" }, 409) });
    await renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: "新增內部使用者" }),
    );
    await userEvent.type(screen.getByLabelText("登入帳號"), "staff");
    await userEvent.type(
      screen.getByLabelText("初始密碼"),
      "New-Internal-Password-2026!",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "建立內部使用者" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失敗：Username already exists",
    );
  });

  it("reports a load failure when the roles request is denied", async () => {
    installMock({ roles: jsonResponse({ detail: "Forbidden" }, 403) });
    render(<RolesPermissionsPage profile={managerProfile} />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "操作失敗：Forbidden",
      ),
    );
  });
});
