import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('records', { id: text('id').primaryKey(), kind: text('kind').notNull(), data: text('data').notNull() });
