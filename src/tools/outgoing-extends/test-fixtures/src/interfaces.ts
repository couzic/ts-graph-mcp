// Three-level interface hierarchy: AdminUser -> User -> BaseEntity

export interface BaseEntity {
	id: number;
	createdAt: Date;
}

export interface User extends BaseEntity {
	name: string;
	email: string;
}

export interface AdminUser extends User {
	permissions: string[];
	role: string;
}
