import Fastify from 'fastify';
import { z } from 'zod';
import { createSchemaMiddleware, matchRoute } from '../src/index.js';

const userParamsSchema = z.object({
	id: z.coerce.number(),
});
const userBodySchema = z.object({
	name: z.string(),
});

const match = matchRoute('get', '/users/42', new URLSearchParams(), [{
	method: 'GET',
	segments: ['', 'users', ':id'],
	queryParams: [],
	schema: { request: userBodySchema },
}]);
if (match !== undefined) {
	const id: string = match.params.id;
	const requestSchema: typeof userBodySchema | undefined = match.schema.request;
	void id;
	void requestSchema;
}

const fastify = Fastify();
createSchemaMiddleware(fastify, {
	routes: {
		'POST /users/:id': {
			urlParams: userParamsSchema,
			request: userBodySchema,
			response: userBodySchema,
		},
	},
	parse: (schema, data, context) => {
		if (context.phase === 'urlParams') {
			const capturedId: string = context.params.id;
			void capturedId;
		}
		if (context.phase === 'request' || context.phase === 'response') {
			const parsedId: number = context.params.id;
			void parsedId;
			context.request.schemaParams?.id;
		}
		return schema.parse(data);
	},
});

void fastify;
