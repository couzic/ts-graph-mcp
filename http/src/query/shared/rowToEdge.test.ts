import { describe, expect, it } from "vitest";
import type { EdgeRow } from "./QueryTypes.js";
import { rowToEdge } from "./rowToEdge.js";

describe(rowToEdge.name, () => {
  it("converts basic edge with source, target, and type only", () => {
    const row: EdgeRow = {
      source: "src/utils.ts:Function:formatDate",
      target: "src/helpers.ts:Function:helper",
      type: "CALLS",
      call_count: null,
      call_sites: null,
      context: null,
    };

    const edge = rowToEdge(row);

    expect(edge).toEqual({
      source: "src/utils.ts:Function:formatDate",
      target: "src/helpers.ts:Function:helper",
      type: "CALLS",
    });
    expect(edge).not.toHaveProperty("callCount");
    expect(edge).not.toHaveProperty("context");
  });

  it("converts CALLS edge with call_count", () => {
    const row: EdgeRow = {
      source: "src/api/handler.ts:Function:createUser",
      target: "src/db/user.ts:Function:saveUser",
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
      source: "src/api/handler.ts:Function:createUser",
      target: "src/db/user.ts:Function:saveUser",
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
      source: "src/foo.ts:Function:bar",
      target: "src/baz.ts:Function:qux",
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
      source: "src/api/handler.ts:Function:createUser",
      target: "src/types/User.ts:Interface:User",
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
      source: "src/a.ts:Function:fnA",
      target: "src/b.ts:Function:fnB",
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
      source: "src/dispatch.ts:Function:dispatch",
      target: "src/handlers.ts:Function:handleUser",
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
      source: "src/models/Admin.ts:Class:Admin",
      target: "src/models/User.ts:Class:User",
      type: "EXTENDS",
      call_count: null,
      call_sites: null,
      context: null,
    };

    const edge = rowToEdge(row);

    expect(edge).toEqual({
      source: "src/models/Admin.ts:Class:Admin",
      target: "src/models/User.ts:Class:User",
      type: "EXTENDS",
    });
  });

  it("converts IMPLEMENTS edge", () => {
    const row: EdgeRow = {
      source: "src/services/UserService.ts:Class:UserService",
      target: "src/interfaces/IUserService.ts:Interface:IUserService",
      type: "IMPLEMENTS",
      call_count: null,
      call_sites: null,
      context: null,
    };

    const edge = rowToEdge(row);

    expect(edge).toEqual({
      source: "src/services/UserService.ts:Class:UserService",
      target: "src/interfaces/IUserService.ts:Interface:IUserService",
      type: "IMPLEMENTS",
    });
  });
});
