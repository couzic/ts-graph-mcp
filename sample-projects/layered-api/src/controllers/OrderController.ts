/**
 * Order controller - calls OrderService.
 * Handles HTTP request/response logic for order endpoints.
 */

import {
	getOrderById,
	getOrdersByUserId,
	listOrders,
	placeOrder,
	cancelOrder,
	completeOrder,
	removeOrder,
	type Order,
} from "../services/OrderService";

export interface HttpRequest {
	params: Record<string, string>;
	query: Record<string, string>;
	body: unknown;
}

export interface HttpResponse {
	status: number;
	body: unknown;
}

export function handleGetOrder(req: HttpRequest): HttpResponse {
	const { id } = req.params;
	const order = getOrderById(id);

	if (!order) {
		return { status: 404, body: { error: "Order not found" } };
	}

	return { status: 200, body: order };
}

export function handleListOrders(req: HttpRequest): HttpResponse {
	const { userId } = req.query;

	if (userId) {
		const orders = getOrdersByUserId(userId);
		return { status: 200, body: orders };
	}

	const orders = listOrders();
	return { status: 200, body: orders };
}

export function handleCreateOrder(req: HttpRequest): HttpResponse {
	const { userId, productId, quantity, unitPrice } = req.body as {
		userId: string;
		productId: string;
		quantity: number;
		unitPrice: number;
	};

	try {
		const order = placeOrder(userId, productId, quantity, unitPrice);
		return { status: 201, body: order };
	} catch (error) {
		return {
			status: 400,
			body: { error: (error as Error).message },
		};
	}
}

export function handleCancelOrder(req: HttpRequest): HttpResponse {
	const { id } = req.params;

	try {
		const success = cancelOrder(id);
		return success
			? { status: 200, body: { message: "Order cancelled" } }
			: { status: 404, body: { error: "Order not found" } };
	} catch (error) {
		return {
			status: 400,
			body: { error: (error as Error).message },
		};
	}
}

export function handleCompleteOrder(req: HttpRequest): HttpResponse {
	const { id } = req.params;

	try {
		const success = completeOrder(id);
		return success
			? { status: 200, body: { message: "Order completed" } }
			: { status: 404, body: { error: "Order not found" } };
	} catch (error) {
		return {
			status: 400,
			body: { error: (error as Error).message },
		};
	}
}

export function handleDeleteOrder(req: HttpRequest): HttpResponse {
	const { id } = req.params;
	const success = removeOrder(id);

	return success
		? { status: 200, body: { message: "Order deleted" } }
		: { status: 404, body: { error: "Order not found" } };
}
