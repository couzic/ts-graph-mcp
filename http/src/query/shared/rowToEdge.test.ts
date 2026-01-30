import { describe, expect, it } from "vitest";
import type { EdgeRow } from "./QueryTypes.js";
import { rowToEdge } from "./rowToEdge.js";

describe(rowToEdge.name, () => {
  it("converts basic edge with source, target, and type only", () => {
    const row: EdgeRow = {
      source: "src/utils.ts:formatDate",
      target: "src/helpers.ts:helper",
      type: "CALLS",
      call_count: null,
      call_sites: null,
      context: null,
    };

    const edge = rowToEdge(row);

    expect(edge).toEqual({
      source: "src/utils.ts:formatDate",
      target: "src/helpers.ts:helper",
      type: "CALLS",
    });
    expect(edge).not.toHaveProperty("callCount");
    expect(edge).not.toHaveProperty("context");
  });

  it("converts CALLS edge with call_count", () => {
    const row: EdgeRow = {
      source: "src/api/handler.ts:createUser",
      target: "src/db/user.ts:saveUser",
      type: "CALLS",
      call_count: 3,
      call_sites: null,
      context: null,
    };

    const edge = rowToEdge(row);

    expect(edge.callCount).toBe(3);
  });

  it("parses call_sites JSON array", () => {
    const row: EdgeRow = {
      source: "src/api/handler.ts:createUser",
      target: "src/db/user.ts:saveUser",
      type: "CALLS",
      call_count: 3,
      call_sites: "[12, 45, 87]",
      context: null,
    };

    const edge = rowToEdge(row);

    expect(edge.callSites).toEqual([12, 45, 87]);
  });

  it("includes call_count of 0 (falsy but not null)", () => {
    const row: EdgeRow = {
      source: "src/foo.ts:bar",
      target: "src/baz.ts:qux",
      type: "CALLS",
      call_count: 0,
      call_sites: null,
      context: null,
    };

    const edge = rowToEdge(row);

    expect(edge.callCount).toBe(0);
  });

  it("includes context field when present", () => {
    const row: EdgeRow = {
      source: "src/api/handler.ts:createUser",
      target: "src/types/User.ts:User",
      type: "USES_TYPE",
      call_count: null,
      call_sites: null,
      context: "parameter",
    };

    const edge = rowToEdge(row);

    expect(edge.context).toBe("parameter");
  });

  it("omits optional fields when all are null", () => {
    const row: EdgeRow = {
      source: "src/a.ts:fnA",
      target: "src/b.ts:fnB",
      type: "CALLS",
      call_count: null,
      call_sites: null,
      context: null,
    };

    const edge = rowToEdge(row);

    const keys = Object.keys(edge);
    expect(keys).toEqual(["source", "target", "type"]);
  });

  it("converts REFERENCES edge with referenceContext", () => {
    const row: EdgeRow = {
      source: "src/dispatch.ts:dispatch",
      target: "src/handlers.ts:handleUser",
      type: "REFERENCES",
      call_count: null,
      call_sites: null,
      context: null,
      reference_context: "callback",
    };

    const edge = rowToEdge(row);

    expect(edge.referenceContext).toBe("callback");
  });

  it("converts EXTENDS edge", () => {
    const row: EdgeRow = {
      source: "src/models/Admin.ts:Admin",
      target: "src/models/User.ts:User",
      type: "EXTENDS",
      call_count: null,
      call_sites: null,
      context: null,
    };

    const edge = rowToEdge(row);

    expect(edge).toEqual({
      source: "src/models/Admin.ts:Admin",
      target: "src/models/User.ts:User",
      type: "EXTENDS",
    });
  });

  it("converts IMPLEMENTS edge", () => {
    const row: EdgeRow = {
      source: "src/services/UserService.ts:UserService",
      target: "src/interfaces/IUserService.ts:IUserService",
      type: "IMPLEMENTS",
      call_count: null,
      call_sites: null,
      context: null,
    };

    const edge = rowToEdge(row);

    expect(edge).toEqual({
      source: "src/services/UserService.ts:UserService",
      target: "src/interfaces/IUserService.ts:IUserService",
      type: "IMPLEMENTS",
    });
  });
});
