import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	closeDatabase,
	openDatabase,
} from "../../db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../db/sqlite/SqliteWriter.js";
import type {
	FunctionNode,
	InterfaceNode,
	MethodNode,
	PropertyNode,
} from "../../db/Types.js";
import { queryTypeUsages } from "./query.js";

describe(queryTypeUsages.name, () => {
	let db: Database.Database;

	beforeAll(() => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
	});

	afterAll(() => {
		closeDatabase(db);
	});

	it("finds functions that use a type as parameter", () => {
		const writer = createSqliteWriter(db);

		const userType: InterfaceNode = {
			id: "src/types.ts:User",
			type: "Interface",
			name: "User",
			module: "core",
			package: "main",
			filePath: "src/types.ts",
			startLine: 1,
			endLine: 5,
			exported: true,
		};

		const createUser: FunctionNode = {
			id: "src/api.ts:createUser",
			type: "Function",
			name: "createUser",
			module: "core",
			package: "main",
			filePath: "src/api.ts",
			startLine: 10,
			endLine: 15,
			exported: true,
			parameters: [{ name: "user", type: "User" }],
		};

		writer.addNodes([userType, createUser]);
		writer.addEdges([
			{
				source: createUser.id,
				target: userType.id,
				type: "USES_TYPE",
				context: "parameter",
			},
		]);

		const usages = queryTypeUsages(db, userType.id);

		expect(usages).toHaveLength(1);
		expect(usages[0]?.node.id).toBe(createUser.id);
		expect(usages[0]?.edge.context).toBe("parameter");
	});

	it("finds functions that use a type as return type", () => {
		const writer = createSqliteWriter(db);

		const configType: InterfaceNode = {
			id: "src/types.ts:Config",
			type: "Interface",
			name: "Config",
			module: "core",
			package: "main",
			filePath: "src/types.ts",
			startLine: 20,
			endLine: 25,
			exported: true,
		};

		const getConfig: FunctionNode = {
			id: "src/api.ts:getConfig",
			type: "Function",
			name: "getConfig",
			module: "core",
			package: "main",
			filePath: "src/api.ts",
			startLine: 30,
			endLine: 35,
			exported: true,
			returnType: "Config",
		};

		writer.addNodes([configType, getConfig]);
		writer.addEdges([
			{
				source: getConfig.id,
				target: configType.id,
				type: "USES_TYPE",
				context: "return",
			},
		]);

		const usages = queryTypeUsages(db, configType.id);

		expect(usages).toHaveLength(1);
		expect(usages[0]?.node.id).toBe(getConfig.id);
		expect(usages[0]?.edge.context).toBe("return");
	});

	it("filters by context", () => {
		const writer = createSqliteWriter(db);

		const dataType: InterfaceNode = {
			id: "src/types.ts:Data",
			type: "Interface",
			name: "Data",
			module: "core",
			package: "main",
			filePath: "src/types.ts",
			startLine: 40,
			endLine: 45,
			exported: true,
		};

		const processData: FunctionNode = {
			id: "src/service.ts:processData",
			type: "Function",
			name: "processData",
			module: "core",
			package: "main",
			filePath: "src/service.ts",
			startLine: 50,
			endLine: 55,
			exported: true,
			parameters: [{ name: "data", type: "Data" }],
		};

		const getData: FunctionNode = {
			id: "src/service.ts:getData",
			type: "Function",
			name: "getData",
			module: "core",
			package: "main",
			filePath: "src/service.ts",
			startLine: 60,
			endLine: 65,
			exported: true,
			returnType: "Data",
		};

		writer.addNodes([dataType, processData, getData]);
		writer.addEdges([
			{
				source: processData.id,
				target: dataType.id,
				type: "USES_TYPE",
				context: "parameter",
			},
			{
				source: getData.id,
				target: dataType.id,
				type: "USES_TYPE",
				context: "return",
			},
		]);

		// Filter for parameter context only
		const parameterUsages = queryTypeUsages(db, dataType.id, "parameter");
		expect(parameterUsages).toHaveLength(1);
		expect(parameterUsages[0]?.node.id).toBe(processData.id);

		// Filter for return context only
		const returnUsages = queryTypeUsages(db, dataType.id, "return");
		expect(returnUsages).toHaveLength(1);
		expect(returnUsages[0]?.node.id).toBe(getData.id);

		// No filter - should return both
		const allUsages = queryTypeUsages(db, dataType.id);
		expect(allUsages).toHaveLength(2);
	});

	it("finds properties that use a type", () => {
		const writer = createSqliteWriter(db);

		const addressType: InterfaceNode = {
			id: "src/types.ts:Address",
			type: "Interface",
			name: "Address",
			module: "core",
			package: "main",
			filePath: "src/types.ts",
			startLine: 70,
			endLine: 75,
			exported: true,
		};

		const userAddressProp: PropertyNode = {
			id: "src/models.ts:User.address",
			type: "Property",
			name: "address",
			module: "core",
			package: "main",
			filePath: "src/models.ts",
			startLine: 80,
			endLine: 80,
			exported: false,
			propertyType: "Address",
		};

		writer.addNodes([addressType, userAddressProp]);
		writer.addEdges([
			{
				source: userAddressProp.id,
				target: addressType.id,
				type: "USES_TYPE",
				context: "property",
			},
		]);

		const usages = queryTypeUsages(db, addressType.id, "property");

		expect(usages).toHaveLength(1);
		expect(usages[0]?.node.id).toBe(userAddressProp.id);
		expect(usages[0]?.edge.context).toBe("property");
	});

	it("returns empty array when type is not used", () => {
		const writer = createSqliteWriter(db);

		const unusedType: InterfaceNode = {
			id: "src/types.ts:Unused",
			type: "Interface",
			name: "Unused",
			module: "core",
			package: "main",
			filePath: "src/types.ts",
			startLine: 90,
			endLine: 95,
			exported: true,
		};

		writer.addNodes([unusedType]);

		const usages = queryTypeUsages(db, unusedType.id);

		expect(usages).toHaveLength(0);
	});

	it("orders results by package, module, file, and line", () => {
		const writer = createSqliteWriter(db);

		const entityType: InterfaceNode = {
			id: "src/types.ts:Entity",
			type: "Interface",
			name: "Entity",
			module: "shared",
			package: "types",
			filePath: "src/types.ts",
			startLine: 100,
			endLine: 105,
			exported: true,
		};

		const backendSave: MethodNode = {
			id: "src/backend.ts:Repository.save",
			type: "Method",
			name: "save",
			module: "backend",
			package: "api",
			filePath: "src/backend.ts",
			startLine: 10,
			endLine: 15,
			exported: false,
			parameters: [{ name: "entity", type: "Entity" }],
		};

		const frontendCreate: FunctionNode = {
			id: "src/frontend.ts:createEntity",
			type: "Function",
			name: "createEntity",
			module: "frontend",
			package: "ui",
			filePath: "src/frontend.ts",
			startLine: 5,
			endLine: 10,
			exported: true,
			returnType: "Entity",
		};

		const backendLoad: MethodNode = {
			id: "src/backend.ts:Repository.load",
			type: "Method",
			name: "load",
			module: "backend",
			package: "api",
			filePath: "src/backend.ts",
			startLine: 20,
			endLine: 25,
			exported: false,
			returnType: "Entity",
		};

		writer.addNodes([entityType, backendSave, frontendCreate, backendLoad]);
		writer.addEdges([
			{
				source: backendSave.id,
				target: entityType.id,
				type: "USES_TYPE",
				context: "parameter",
			},
			{
				source: frontendCreate.id,
				target: entityType.id,
				type: "USES_TYPE",
				context: "return",
			},
			{
				source: backendLoad.id,
				target: entityType.id,
				type: "USES_TYPE",
				context: "return",
			},
		]);

		const usages = queryTypeUsages(db, entityType.id);

		expect(usages).toHaveLength(3);
		// Should be ordered: backend/api (save line 10, then load line 20), then frontend/ui
		expect(usages[0]?.node.id).toBe(backendSave.id);
		expect(usages[1]?.node.id).toBe(backendLoad.id);
		expect(usages[2]?.node.id).toBe(frontendCreate.id);
	});

	it("ignores non-USES_TYPE edges", () => {
		const writer = createSqliteWriter(db);

		const baseType: InterfaceNode = {
			id: "src/types.ts:BaseType",
			type: "Interface",
			name: "BaseType",
			module: "core",
			package: "main",
			filePath: "src/types.ts",
			startLine: 110,
			endLine: 115,
			exported: true,
		};

		const derivedType: InterfaceNode = {
			id: "src/types.ts:DerivedType",
			type: "Interface",
			name: "DerivedType",
			module: "core",
			package: "main",
			filePath: "src/types.ts",
			startLine: 120,
			endLine: 125,
			exported: true,
		};

		const usesDerived: FunctionNode = {
			id: "src/api.ts:usesDerived",
			type: "Function",
			name: "usesDerived",
			module: "core",
			package: "main",
			filePath: "src/api.ts",
			startLine: 130,
			endLine: 135,
			exported: true,
			parameters: [{ name: "data", type: "DerivedType" }],
		};

		writer.addNodes([baseType, derivedType, usesDerived]);
		writer.addEdges([
			{
				source: derivedType.id,
				target: baseType.id,
				type: "EXTENDS", // Not USES_TYPE
			},
			{
				source: usesDerived.id,
				target: derivedType.id,
				type: "USES_TYPE",
				context: "parameter",
			},
		]);

		// Query for BaseType should not return DerivedType (EXTENDS edge)
		const baseUsages = queryTypeUsages(db, baseType.id);
		expect(baseUsages).toHaveLength(0);

		// Query for DerivedType should return usesDerived (USES_TYPE edge)
		const derivedUsages = queryTypeUsages(db, derivedType.id);
		expect(derivedUsages).toHaveLength(1);
		expect(derivedUsages[0]?.node.id).toBe(usesDerived.id);
	});
});
