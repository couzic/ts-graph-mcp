/**
 * Order repository - calls Database layer.
 * Handles order data persistence.
 */

import { query, execute, transaction } from "../db/Database";

export interface OrderEntity {
	id: string;
	userId: string;
	productId: string;
	quantity: number;
	total: number;
	createdAt: Date;
}

export function findOrderById(id: string): OrderEntity | null {
	const result = query<OrderEntity>("SELECT * FROM orders WHERE id = ?", [id]);
	return result.rows[0] || null;
}

export function findOrdersByUserId(userId: string): OrderEntity[] {
	const result = query<OrderEntity>(
		"SELECT * FROM orders WHERE user_id = ?",
		[userId],
	);
	return result.rows;
}

export function findAllOrders(): OrderEntity[] {
	const result = query<OrderEntity>("SELECT * FROM orders");
	return result.rows;
}

export function createOrder(
	userId: string,
	productId: string,
	quantity: number,
	total: number,
): OrderEntity | null {
	return transaction(() => {
		const id = crypto.randomUUID();
		execute(
			"INSERT INTO orders (id, user_id, product_id, quantity, total) VALUES (?, ?, ?, ?, ?)",
			[id, userId, productId, quantity, total],
		);
		return findOrderById(id);
	});
}

export function updateOrderStatus(id: string, status: string): boolean {
	const affected = execute("UPDATE orders SET status = ? WHERE id = ?", [
		status,
		id,
	]);
	return affected > 0;
}

export function deleteOrder(id: string): boolean {
	const affected = execute("DELETE FROM orders WHERE id = ?", [id]);
	return affected > 0;
}
