import { afterEach, expect, test } from '@jest/globals';
import Fastify from 'fastify';
import { createSchemaMiddleware } from '../src/index.js';
import { matchRoute, parseRouteEntries } from '../src/utils.schema/src/index.js';

const fastifyInstances = [];

afterEach(async () => {
	await Promise.all(fastifyInstances.splice(0).map((fastify) => fastify.close()));
});

function createFastify() {
	const fastify = Fastify();
	fastifyInstances.push(fastify);
	return fastify;
}

function createHookHarness() {
	const hooks = {};
	const fastify = {
		addHook(name, handler) {
			hooks[name] = handler;
		},
	};

	return { fastify, hooks };
}

test('checks the shared route matcher', () => {
	const schema = { request: 'request-schema' };
	const routes = parseRouteEntries({
		'GET /users/:id?view=:view': schema,
	});

	expect(matchRoute('get', '/users/42', new URLSearchParams('view=compact'), routes))
		.toEqual({ params: { id: '42', view: 'compact' }, schema });
});

test('parses URL params and request bodies, then validates response payloads', async () => {
	const fastify = createFastify();
	const parsed = [];

	createSchemaMiddleware(fastify, {
		routes: {
			'POST /users/:id?active=:active': {
				urlParams: 'params',
				request: 'request',
				response: 'response',
			},
		},
		parse: (schema, data, { phase, params }) => {
			parsed.push({ schema, phase, params });
			if (phase === 'urlParams') {
				return { ...data, id: Number(data.id), active: data.active === 'true' };
			}
			return { ...data, validated: true };
		},
	});

	fastify.post('/users/:id', async (request) => ({
		id: request.schemaParams.id,
		...request.body,
	}));

	const response = await fastify.inject({
		method: 'POST',
		url: '/users/42?active=true',
		payload: { name: 'Ada' },
	});

	expect(response.statusCode).toBe(200);
	expect(response.json()).toEqual({
		id: 42,
		name: 'Ada',
		validated: true,
	});
	expect(parsed.map(({ phase }) => phase)).toEqual(['urlParams', 'request', 'response']);
	expect(parsed[1].params).toEqual({ id: 42, active: true });
	expect(parsed[2].params).toEqual({ id: 42, active: true });
});

test('leaves non-matching routes unchanged', async () => {
	const fastify = createFastify();
	let parseCalls = 0;

	createSchemaMiddleware(fastify, {
		routes: {
			'POST /users/:id': { request: 'request' },
		},
		parse: (schema, data) => {
			parseCalls += 1;
			return data;
		},
	});
	fastify.get('/health', async () => ({ ok: true }));

	const response = await fastify.inject({ method: 'GET', url: '/health' });
	expect(response.statusCode).toBe(200);
	expect(response.json()).toEqual({ ok: true });
	expect(parseCalls).toBe(0);
});

test('forwards parser errors to Fastify error handling', async () => {
	const fastify = createFastify();
	fastify.setErrorHandler((error, request, reply) => {
		reply.status(400).send({ error: error.message });
	});

	createSchemaMiddleware(fastify, {
		routes: {
			'POST /users/:id': { request: 'request' },
		},
		parse: () => {
			throw new TypeError('name is required');
		},
	});
	fastify.post('/users/:id', async () => ({ ok: true }));

	const response = await fastify.inject({
		method: 'POST',
		url: '/users/42',
		payload: {},
	});
	expect(response.statusCode).toBe(400);
	expect(response.json()).toEqual({ error: 'name is required' });
});

test('forwards response parser errors to Fastify error handling', async () => {
	const fastify = createFastify();
	fastify.setErrorHandler((error, request, reply) => {
		reply.status(500).send({ error: error.message });
	});

	createSchemaMiddleware(fastify, {
		routes: {
			'GET /users/:id': { response: 'response' },
		},
		parse: () => {
			throw new Error('Invalid response');
		},
	});
	fastify.get('/users/:id', async () => ({ id: 42 }));

	const response = await fastify.inject({ method: 'GET', url: '/users/42' });
	expect(response.statusCode).toBe(500);
	expect(response.json()).toEqual({ error: 'Invalid response' });
});

test('rejects invalid middleware configuration', () => {
	const fastify = createFastify();
	expect(() => createSchemaMiddleware()).toThrow('fastify must be a Fastify instance');
	expect(() => createSchemaMiddleware(fastify, { routes: [], parse: () => undefined }))
		.toThrow('routes must be an object keyed by "METHOD /path"');
	expect(() => createSchemaMiddleware(fastify, { routes: {}, parse: undefined }))
		.toThrow('parse must be a function');
	expect(() => createSchemaMiddleware(fastify, { routes: { invalid: {} }, parse: () => undefined }))
		.toThrow('invalid route key: invalid');
	expect(() => createSchemaMiddleware({}, { routes: {}, parse: () => undefined }))
		.toThrow('fastify must be a Fastify instance');
});

test('rejects non-object URL params parser results', async () => {
	for (const result of [null, [], 'invalid']) {
		const { fastify, hooks } = createHookHarness();
		createSchemaMiddleware(fastify, {
			routes: {
				'GET /users/:id': { urlParams: 'params' },
			},
			parse: () => result,
		});

		await expect(hooks.preValidation({ method: 'GET', url: '/users/42' }, {}))
			.rejects.toThrow('urlParams parser must return an object');
	}
});

test('matches routes and skips unmatched requests and responses', async () => {
	const { fastify, hooks } = createHookHarness();
	const parsed = [];
	createSchemaMiddleware(fastify, {
		routes: {
			'GET /users/:id?active=true&role=:role': {
				urlParams: 'params',
				request: 'request',
				response: 'response',
			},
			'POST /items': {},
		},
		parse: (schema, data, { phase, params }) => {
			parsed.push({ schema, phase, params });
			return phase === 'response' ? { ...data, parsed: true } : data;
		},
	});

	for (const request of [
		{ method: 'POST', url: '/users/42?active=true&role=admin' },
		{ method: 'GET', url: '/teams/42?active=true&role=admin' },
		{ method: 'GET', url: '/users/42/extra?active=true&role=admin' },
		{ method: 'GET', url: '/users/42?role=admin' },
		{ method: 'GET', url: '/users/42?active=false&role=admin' },
	]) {
		await expect(hooks.preValidation(request, {})).resolves.toBeUndefined();
		expect(request.schemaParams).toBeUndefined();
	}

	const request = { url: '/users/42?active=true&role=admin', body: {} };
	await expect(hooks.preValidation(request, {})).resolves.toBeUndefined();
	expect(request.schemaParams).toEqual({ id: '42', role: 'admin' });
	expect(parsed.map(({ phase }) => phase)).toEqual(['urlParams', 'request']);

	const responsePayload = { id: 42 };
	await expect(hooks.preSerialization(request, { statusCode: 200 }, responsePayload))
		.resolves.toEqual({ id: 42, parsed: true });
	await expect(hooks.preSerialization(request, { statusCode: 400 }, responsePayload))
		.resolves.toBe(responsePayload);
	await expect(hooks.preSerialization({}, { statusCode: 200 }, responsePayload))
		.resolves.toBe(responsePayload);

	const requestWithoutResponseSchema = { method: 'POST', url: '/items' };
	await hooks.preValidation(requestWithoutResponseSchema, {});
	await expect(hooks.preSerialization(requestWithoutResponseSchema, { statusCode: 200 }, responsePayload))
		.resolves.toBe(responsePayload);
});

test('validates malformed route keys and rejects invalid encoded request paths', async () => {
	const { fastify, hooks } = createHookHarness();
	expect(() => createSchemaMiddleware(fastify, {
		routes: {
			'GET /users#fragment': {},
		},
		parse: () => undefined,
	})).toThrow('invalid route key: GET /users#fragment');
	expect(() => createSchemaMiddleware(fastify, {
		routes: {
			'GET /users?': {},
		},
		parse: () => undefined,
	})).toThrow('invalid route key: GET /users?');

	createSchemaMiddleware(fastify, {
		routes: { 'GET /users/:id': {} },
		parse: (schema, data) => data,
	});
	await expect(hooks.preValidation({ method: 'GET', url: '/users/%E0%A4%A' }, {}))
		.rejects.toBeInstanceOf(URIError);
});
