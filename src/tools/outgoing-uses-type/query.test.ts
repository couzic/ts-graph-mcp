import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	closeDatabase,
	openDatabase,
} from "../../db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../db/sqlite/SqliteWriter.js";
import type {
	ClassNode,
	FunctionNode,
	InterfaceNode,
	MethodNode,
} from "../../db/Types.js";
import { queryTypeDependencies } from "./query.js";

describe(queryTypeDependencies.name, () => {
	let db: Database.Database;

	beforeAll(() => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
	});

	afterAll(() => {
		closeDatabase(db);
	});

	it("finds types used as parameters", () => {
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

		const dependencies = queryTypeDependencies(db, createUser.id);

		expect(dependencies).toHaveLength(1);
		expect(dependencies[0]?.node.id).toBe(userType.id);
		expect(dependencies[0]?.edge.context).toBe("parameter");
	});

	it("finds types used as return types", () => {
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

		const dependencies = queryTypeDependencies(db, getConfig.id);

		expect(dependencies).toHaveLength(1);
		expect(dependencies[0]?.node.id).toBe(configType.id);
		expect(dependencies[0]?.edge.context).toBe("return");
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

		const resultType: InterfaceNode = {
			id: "src/types.ts:Result",
			type: "Interface",
			name: "Result",
			module: "core",
			package: "main",
			filePath: "src/types.ts",
			startLine: 46,
			endLine: 50,
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
			returnType: "Result",
		};

		writer.addNodes([dataType, resultType, processData]);
		writer.addEdges([
			{
				source: processData.id,
				target: dataType.id,
				type: "USES_TYPE",
				context: "parameter",
			},
			{
				source: processData.id,
				target: resultType.id,
				type: "USES_TYPE",
				context: "return",
			},
		]);

		// Filter for parameter context only
		const parameterDeps = queryTypeDependencies(
			db,
			processData.id,
			"parameter",
		);
		expect(parameterDeps).toHaveLength(1);
		expect(parameterDeps[0]?.node.id).toBe(dataType.id);

		// Filter for return context only
		const returnDeps = queryTypeDependencies(db, processData.id, "return");
		expect(returnDeps).toHaveLength(1);
		expect(returnDeps[0]?.node.id).toBe(resultType.id);

		// No filter - should return both
		const allDeps = queryTypeDependencies(db, processData.id);
		expect(allDeps).toHaveLength(2);
	});

	it("finds types used in class properties", () => {
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

		const userClass: ClassNode = {
			id: "src/models.ts:User",
			type: "Class",
			name: "User",
			module: "core",
			package: "main",
			filePath: "src/models.ts",
			startLine: 80,
			endLine: 90,
			exported: true,
		};

		writer.addNodes([addressType, userClass]);
		writer.addEdges([
			{
				source: userClass.id,
				target: addressType.id,
				type: "USES_TYPE",
				context: "property",
			},
		]);

		const dependencies = queryTypeDependencies(db, userClass.id, "property");

		expect(dependencies).toHaveLength(1);
		expect(dependencies[0]?.node.id).toBe(addressType.id);
		expect(dependencies[0]?.edge.context).toBe("property");
	});

	it("returns empty array when no types are used", () => {
		const writer = createSqliteWriter(db);

		const simpleFunction: FunctionNode = {
			id: "src/utils.ts:doSomething",
			type: "Function",
			name: "doSomething",
			module: "core",
			package: "main",
			filePath: "src/utils.ts",
			startLine: 90,
			endLine: 95,
			exported: true,
		};

		writer.addNodes([simpleFunction]);

		const dependencies = queryTypeDependencies(db, simpleFunction.id);

		expect(dependencies).toHaveLength(0);
	});

	it("orders results by package, module, file, and line", () => {
		const writer = createSqliteWriter(db);

		const type1: InterfaceNode = {
			id: "src/types.ts:TypeA",
			type: "Interface",
			name: "TypeA",
			module: "shared",
			package: "types",
			filePath: "src/types.ts",
			startLine: 100,
			endLine: 105,
			exported: true,
		};

		const type2: InterfaceNode = {
			id: "src/types.ts:TypeB",
			type: "Interface",
			name: "TypeB",
			module: "backend",
			package: "api",
			filePath: "src/types.ts",
			startLine: 10,
			endLine: 15,
			exported: true,
		};

		const type3: InterfaceNode = {
			id: "src/types.ts:TypeC",
			type: "Interface",
			name: "TypeC",
			module: "backend",
			package: "api",
			filePath: "src/types.ts",
			startLine: 20,
			endLine: 25,
			exported: true,
		};

		const complexFunction: FunctionNode = {
			id: "src/service.ts:complexFunction",
			type: "Function",
			name: "complexFunction",
			module: "core",
			package: "main",
			filePath: "src/service.ts",
			startLine: 50,
			endLine: 60,
			exported: true,
		};

		writer.addNodes([type1, type2, type3, complexFunction]);
		writer.addEdges([
			{
				source: complexFunction.id,
				target: type1.id,
				type: "USES_TYPE",
				context: "parameter",
			},
			{
				source: complexFunction.id,
				target: type2.id,
				type: "USES_TYPE",
				context: "parameter",
			},
			{
				source: complexFunction.id,
				target: type3.id,
				type: "USES_TYPE",
				context: "return",
			},
		]);

		const dependencies = queryTypeDependencies(db, complexFunction.id);

		expect(dependencies).toHaveLength(3);
		// Should be ordered: backend/api (TypeB line 10, TypeC line 20), then shared/types (TypeA)
		expect(dependencies[0]?.node.id).toBe(type2.id);
		expect(dependencies[1]?.node.id).toBe(type3.id);
		expect(dependencies[2]?.node.id).toBe(type1.id);
	});

	it("ignores non-USES_TYPE edges", () => {
		const writer = createSqliteWriter(db);

		const baseClass: ClassNode = {
			id: "src/base.ts:BaseClass",
			type: "Class",
			name: "BaseClass",
			module: "core",
			package: "main",
			filePath: "src/base.ts",
			startLine: 110,
			endLine: 120,
			exported: true,
		};

		const derivedClass: ClassNode = {
			id: "src/derived.ts:DerivedClass",
			type: "Class",
			name: "DerivedClass",
			module: "core",
			package: "main",
			filePath: "src/derived.ts",
			startLine: 130,
			endLine: 140,
			exported: true,
			extends: "BaseClass",
		};

		const dataType: InterfaceNode = {
			id: "src/types.ts:DataType",
			type: "Interface",
			name: "DataType",
			module: "core",
			package: "main",
			filePath: "src/types.ts",
			startLine: 150,
			endLine: 155,
			exported: true,
		};

		const method: MethodNode = {
			id: "src/derived.ts:DerivedClass.process",
			type: "Method",
			name: "process",
			module: "core",
			package: "main",
			filePath: "src/derived.ts",
			startLine: 135,
			endLine: 138,
			exported: false,
			parameters: [{ name: "data", type: "DataType" }],
		};

		writer.addNodes([baseClass, derivedClass, dataType, method]);
		writer.addEdges([
			{
				source: derivedClass.id,
				target: baseClass.id,
				type: "EXTENDS", // Not USES_TYPE
			},
			{
				source: method.id,
				target: dataType.id,
				type: "USES_TYPE",
				context: "parameter",
			},
		]);

		// Query for DerivedClass should not return BaseClass (EXTENDS edge)
		const derivedDeps = queryTypeDependencies(db, derivedClass.id);
		expect(derivedDeps).toHaveLength(0);

		// Query for method should return DataType (USES_TYPE edge)
		const methodDeps = queryTypeDependencies(db, method.id);
		expect(methodDeps).toHaveLength(1);
		expect(methodDeps[0]?.node.id).toBe(dataType.id);
	});

	it("finds types used in variables", () => {
		const writer = createSqliteWriter(db);

		const errorType: InterfaceNode = {
			id: "src/types.ts:CustomError",
			type: "Interface",
			name: "CustomError",
			module: "core",
			package: "main",
			filePath: "src/types.ts",
			startLine: 160,
			endLine: 165,
			exported: true,
		};

		const handler: FunctionNode = {
			id: "src/handlers.ts:errorHandler",
			type: "Function",
			name: "errorHandler",
			module: "core",
			package: "main",
			filePath: "src/handlers.ts",
			startLine: 170,
			endLine: 175,
			exported: true,
		};

		writer.addNodes([errorType, handler]);
		writer.addEdges([
			{
				source: handler.id,
				target: errorType.id,
				type: "USES_TYPE",
				context: "variable",
			},
		]);

		const dependencies = queryTypeDependencies(db, handler.id, "variable");

		expect(dependencies).toHaveLength(1);
		expect(dependencies[0]?.node.id).toBe(errorType.id);
		expect(dependencies[0]?.edge.context).toBe("variable");
	});
});
