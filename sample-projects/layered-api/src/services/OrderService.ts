/**
 * Order service - calls OrderRepository and UserService.
 * Implements business logic for order operations.
 * Creates cross-service dependency: OrderService -> UserService
 */

import {
	findOrderById,
	findOrdersByUserId,
	findAllOrders,
	createOrder,
	updateOrderStatus,
	deleteOrder,
	type OrderEntity,
} from "../repositories/OrderRepository";

import { getUserById } from "./UserService";

export interface Order {
	id: string;
	userId: string;
	productId: string;
	quantity: number;
	total: number;
	createdAt: Date;
}

export function getOrderById(id: string): Order | null {
	const entity = findOrderById(id);
	return entity ? mapToOrder(entity) : null;
}

export function getOrdersByUserId(userId: string): Order[] {
	const entities = findOrdersByUserId(userId);
	return entities.map(mapToOrder);
}

export function listOrders(): Order[] {
	const entities = findAllOrders();
	return entities.map(mapToOrder);
}

export function placeOrder(
	userId: string,
	productId: string,
	quantity: number,
	unitPrice: number,
): Order | null {
	// Business logic: verify user exists
	const user = getUserById(userId);
	if (!user) {
		throw new Error("User not found");
	}

	// Business logic: validate quantity
	if (quantity <= 0) {
		throw new Error("Quantity must be positive");
	}

	const total = quantity * unitPrice;
	const entity = createOrder(userId, productId, quantity, total);
	return entity ? mapToOrder(entity) : null;
}

export function cancelOrder(id: string): boolean {
	return updateOrderStatus(id, "cancelled");
}

export function completeOrder(id: string): boolean {
	return updateOrderStatus(id, "completed");
}

export function removeOrder(id: string): boolean {
	return deleteOrder(id);
}

function mapToOrder(entity: OrderEntity): Order {
	return {
		id: entity.id,
		userId: entity.userId,
		productId: entity.productId,
		quantity: entity.quantity,
		total: entity.total,
		createdAt: entity.createdAt,
	};
}
