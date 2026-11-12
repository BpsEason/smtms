import { describe, it, expect } from "vitest";
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  canAccess,
} from "./permissions";

describe("permissions", () => {
  describe("hasPermission", () => {
    it("returns true when permission exists", () => {
      expect(hasPermission(["a:read"], "a:read")).toBe(true);
    });

    it("returns false when permission missing", () => {
      expect(hasPermission(["a:read"], "b:read")).toBe(false);
    });

    it("handles null granted", () => {
      expect(hasPermission(null, "a:read")).toBe(false);
    });

    it("handles undefined granted", () => {
      expect(hasPermission(undefined, "a:read")).toBe(false);
    });
  });

  describe("hasAllPermissions", () => {
    it("returns true when all permissions exist", () => {
      expect(hasAllPermissions(["a:read", "b:read"], ["a:read", "b:read"])).toBe(
        true,
      );
    });

    it("returns false when one permission missing", () => {
      expect(hasAllPermissions(["a:read"], ["a:read", "b:read"])).toBe(false);
    });

    it("returns true for empty required array", () => {
      expect(hasAllPermissions(["a:read"], [])).toBe(true);
    });

    it("handles null granted", () => {
      expect(hasAllPermissions(null, ["a:read"])).toBe(false);
    });
  });

  describe("hasAnyPermission", () => {
    it("returns true when at least one permission exists", () => {
      expect(hasAnyPermission(["a:read"], ["a:read", "b:read"])).toBe(true);
    });

    it("returns false when no permissions match", () => {
      expect(hasAnyPermission(["c:read"], ["a:read", "b:read"])).toBe(false);
    });

    it("returns false for empty required array", () => {
      expect(hasAnyPermission(["a:read"], [])).toBe(false);
    });

    it("handles null granted", () => {
      expect(hasAnyPermission(null, ["a:read"])).toBe(false);
    });
  });

  describe("canAccess", () => {
    it("returns true for permission: null", () => {
      expect(canAccess(["a:read"], { permission: null })).toBe(true);
    });

    it("returns true for undefined permission", () => {
      expect(canAccess(["a:read"], { permission: undefined })).toBe(true);
    });

    it("returns true when single permission matches", () => {
      expect(canAccess(["a:read"], { permission: "a:read" })).toBe(true);
    });

    it("returns false when single permission missing", () => {
      expect(canAccess(["a:read"], { permission: "b:read" })).toBe(false);
    });

    it("returns true when all permissions match", () => {
      expect(
        canAccess(["a:read", "b:read"], { permissions: ["a:read", "b:read"] }),
      ).toBe(true);
    });

    it("returns false when one of required permissions missing", () => {
      expect(
        canAccess(["a:read"], { permissions: ["a:read", "b:read"] }),
      ).toBe(false);
    });

    it("returns true when empty permissions array (treated as not set)", () => {
      expect(canAccess(["a:read"], { permissions: [] })).toBe(true);
    });

    it("returns true when any permission matches", () => {
      expect(
        canAccess(["a:read"], { anyPermissions: ["a:read", "b:read"] }),
      ).toBe(true);
    });

    it("returns false when no anyPermissions match", () => {
      expect(
        canAccess(["c:read"], { anyPermissions: ["a:read", "b:read"] }),
      ).toBe(false);
    });

    it("returns true when empty anyPermissions array (treated as not set)", () => {
      expect(canAccess(["a:read"], { anyPermissions: [] })).toBe(true);
    });

    it("handles null granted for single permission", () => {
      expect(canAccess(null, { permission: "a:read" })).toBe(false);
    });

    it("handles null granted for all permissions", () => {
      expect(canAccess(null, { permissions: ["a:read"] })).toBe(false);
    });

    it("handles null granted for any permissions", () => {
      expect(canAccess(null, { anyPermissions: ["a:read"] })).toBe(false);
    });

    it("handles undefined granted", () => {
      expect(canAccess(undefined, { permission: "a:read" })).toBe(false);
    });

    it("priority: anyPermissions over permissions over permission", () => {
      expect(
        canAccess(
          ["quality:review"],
          {
            anyPermissions: ["quality:review"],
            permissions: ["missing:perm"],
            permission: "also:missing",
          },
        ),
      ).toBe(true);
    });

    it("priority: permissions over permission when anyPermissions not set", () => {
      expect(
        canAccess(
          ["a:read"],
          {
            permissions: ["a:read", "b:read"],
            permission: "missing:perm",
          },
        ),
      ).toBe(false);
    });
  });
});