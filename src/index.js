import { matchRoute, parseRouteEntries } from './utils.schema/src/index.js';

/**
 * Installs route-based validation hooks on a Fastify instance.
 *
 * @param {import('fastify').FastifyInstance} fastify - Fastify instance to decorate with validation hooks.
 * @param {{
 *   routes: Record<string, {
 *     urlParams?: unknown,
 *     request?: unknown,
 *     response?: unknown,
 *   }>,
 *   parse: (schema: unknown, data: unknown, context: {
 *     phase: 'urlParams' | 'request' | 'response',
 *     request: import('fastify').FastifyRequest,
 *     reply: import('fastify').FastifyReply,
 *     params: Record<string, unknown>,
 *   }) => unknown | Promise<unknown>
 * }} options - Middleware configuration.
 * @returns {import('fastify').FastifyInstance} The Fastify instance.
 * @throws {TypeError} If the Fastify instance, routes, route keys, or parser are invalid.
 */
export function createSchemaMiddleware(fastify, options) {
	const { routes, parse } = options ?? {};

	if (!fastify || typeof fastify.addHook !== 'function') {
		throw new TypeError('fastify must be a Fastify instance');
	}

	if (!routes || typeof routes !== 'object' || Array.isArray(routes)) {
		throw new TypeError('routes must be an object keyed by "METHOD /path"');
	}

	if (typeof parse !== 'function') {
		throw new TypeError('parse must be a function');
	}

	const routeEntries = parseRouteEntries(routes);
	const matchesByRequest = new WeakMap();

	fastify.addHook('preValidation', async (request, reply) => {
		const url = new URL(request.url, 'http://localhost');
		const match = matchRoute(request.method, url.pathname, url.searchParams, routeEntries);
		if (match === undefined) {
			return;
		}

		let params = match.params;
		if (match.schema.urlParams !== undefined) {
			const parsedParams = await parse(match.schema.urlParams, params, {
				phase: 'urlParams',
				request,
				reply,
				params,
			});
			if (parsedParams === null || typeof parsedParams !== 'object' || Array.isArray(parsedParams)) {
				throw new TypeError('urlParams parser must return an object');
			}
			params = parsedParams;
		}

		request.schemaParams = params;
		matchesByRequest.set(request, { match, params });

		if (match.schema.request !== undefined) {
			request.body = await parse(match.schema.request, request.body, {
				phase: 'request',
				request,
				reply,
				params,
			});
		}
	});

	fastify.addHook('preSerialization', async (request, reply, payload) => {
		if (reply.statusCode >= 400) {
			return payload;
		}

		const requestMatch = matchesByRequest.get(request);
		const schema = requestMatch?.match.schema.response;
		if (schema === undefined) {
			return payload;
		}

		return parse(schema, payload, {
			phase: 'response',
			request,
			reply,
			params: requestMatch.params,
		});
	});

	return fastify;
}
