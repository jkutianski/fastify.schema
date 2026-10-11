import Fastify from 'fastify';
import { z } from 'zod';
import { createSchemaMiddleware } from '../src/index.js';

const app = Fastify();

const userParamsSchema = z.object({
	id: z.coerce.number().int().positive(),
});
const userBodySchema = z.object({
	name: z.string().min(1),
});
const userResponseSchema = z.object({
	id: z.number().int().positive(),
	name: z.string(),
});

createSchemaMiddleware(app, {
	routes: {
		'GET /users/:id': {
			urlParams: userParamsSchema,
			response: userResponseSchema,
		},
		'POST /users': {
			request: userBodySchema,
			response: userResponseSchema,
		},
	},
	parse: (schema, data, context) => {
		try {
			return schema.parse(data);
		} catch (error) {
			if (context.phase !== 'response' && error instanceof Error) {
				Object.assign(error, { statusCode: 400 });
			}
			throw error;
		}
	},
});

app.get<{ Params: { id: string } }>('/users/:id', async (request) => ({
	id: Number(request.params.id),
	name: 'Ada',
}));

app.post<{ Body: z.infer<typeof userBodySchema> }>('/users', async (request) => ({
	id: 1,
	name: request.body.name,
}));

void app;
