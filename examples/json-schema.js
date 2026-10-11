import Fastify from 'fastify';
import Ajv from 'ajv';
import { createSchemaMiddleware } from '../src/index.js';

const app = Fastify({ logger: true });
const ajv = new Ajv();

const userParamsSchema = {
	type: 'object',
	properties: {
		id: { type: 'string', pattern: '^[1-9]\\d*$' },
	},
	required: ['id'],
	additionalProperties: false,
};
const createUserSchema = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1 },
		email: { type: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
	},
	required: ['name', 'email'],
	additionalProperties: false,
};
const userResponseSchema = {
	type: 'object',
	properties: {
		id: { type: 'integer', minimum: 1 },
		name: { type: 'string' },
		email: { type: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
	},
	required: ['id', 'name', 'email'],
	additionalProperties: false,
};

createSchemaMiddleware(app, {
	routes: {
		'POST /users': {
			request: createUserSchema,
			response: userResponseSchema,
		},
		'GET /users/:id': {
			urlParams: userParamsSchema,
			response: userResponseSchema,
		},
	},
	parse: (schema, data, { phase, params }) => {
		const validate = ajv.compile(schema);
		if (!validate(data)) {
			const error = new TypeError(ajv.errorsText(validate.errors));
			if (phase !== 'response') {
				error.statusCode = 400;
			}
			throw error;
		}
		if (phase === 'response' && 'id' in params) {
			app.log.info(`Validated response for user ${params.id}`);
		}
		return data;
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
	id: Number(request.schemaParams.id),
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
