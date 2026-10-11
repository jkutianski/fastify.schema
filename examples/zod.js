import Fastify from 'fastify';
import { z } from 'zod';
import { createSchemaMiddleware } from '../src/index.js';

const app = Fastify({ logger: true });

createSchemaMiddleware(app, {
	routes: {
		'POST /users': {
			request: z.object({
				name: z.string().min(1),
				email: z.email(),
			}),
			response: z.object({
				id: z.number().int().positive(),
				name: z.string(),
				email: z.email(),
			}),
		},
		'GET /users/:id': {
			urlParams: z.object({ id: z.coerce.number().int().positive() }),
			response: z.object({
				id: z.number().int().positive(),
				name: z.string(),
				email: z.email(),
			}),
		},
	},
	parse: (schema, data, { phase, params }) => {
		if (phase === 'response' && 'id' in params) {
			app.log.info(`Validated response for user ${params.id}`);
		}
		try {
			return schema.parse(data);
		} catch (error) {
			if (phase !== 'response') {
				error.statusCode = 400;
			}
			throw error;
		}
	},
});

app.setErrorHandler((error, request, reply) => {
	reply.status(error.statusCode ?? 500).send({ error: error.message });
});

app.post('/users', async (request, reply) => {
	reply.code(201);
	return { id: 1, ...request.body };
});

app.get('/users/:id', async (request) => ({
	id: request.schemaParams.id,
	name: 'Ada Lovelace',
	email: 'ada@example.com',
}));

try {
	await app.ready();

	const createdUser = await app.inject({
		method: 'POST',
		url: '/users',
		payload: { name: 'Ada Lovelace', email: 'ada@example.com' },
	});
	console.log('Created user:', createdUser.json());

	const fetchedUser = await app.inject({ method: 'GET', url: '/users/1' });
	console.log('Fetched user:', fetchedUser.json());

	const invalidUser = await app.inject({
		method: 'POST',
		url: '/users',
		payload: { name: '', email: 'not-an-email' },
	});
	console.log('Invalid request:', invalidUser.statusCode, invalidUser.json());
} finally {
	await app.close();
}
