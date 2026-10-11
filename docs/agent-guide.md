# Agent Guide

This project is a small ESM JavaScript library that installs route-based validation hooks on a Fastify instance. Schema validation and transformations are delegated to the consumer-supplied `parse` function.

## Project purpose

`fastify.schema` selects route schemas by HTTP method and URL path and can parse:

- Captured path and query parameters (`urlParams`)
- Request bodies (`request`)
- Successful serialized response payloads (`response`)

The library does not replace Fastify's built-in schema system and does not require a particular validation library. It can adapt Zod, Ajv/JSON Schema, or a custom synchronous or asynchronous parser.

## Public API

```js
createSchemaMiddleware(fastify, { routes, parse })
```

The function registers `preValidation` and `preSerialization` hooks on the supplied Fastify instance and returns that instance. Register it before the routes it should cover. Fastify encapsulates hooks, so install the hooks and register covered routes in the same Fastify scope.

Example route definitions:

```js
{
  'GET /users/:id': { urlParams: paramsSchema, response: userSchema },
  'POST /users': { request: createUserSchema, response: userSchema },
  'GET /users?active=true&id=:id': { urlParams: paramsSchema }
}
```

## Matching behavior

- HTTP methods are case-insensitive.
- Static path segments match exactly.
- `:name` path segments capture one non-empty segment.
- Query parameters listed in a route key must be present. `:name` values are captured; literal values must match exactly.
- Query parameters not listed in the route key are ignored.
- Captured path and query values are strings.
- Invalid route keys are rejected when hooks are installed. Invalid percent-encoding in a request path rejects the `preValidation` hook and is handled by Fastify's normal error lifecycle.
- Unmatched requests pass through without changing params or body.

## Parser contract and hook flow

The parser receives `(schema, data, context)` and can be asynchronous:

```js
parse(schema, data, context)
```

`context` contains:

- `phase`: `'urlParams'`, `'request'`, or `'response'`
- `request` and `reply`: Fastify request and reply objects
- `params`: captured values in the `urlParams` phase, parsed values in later phases

For each matching request:

1. The `preValidation` hook runs the optional `urlParams` parser. It must return a non-null, non-array object.
2. Parsed URL params are assigned to `request.schemaParams`.
3. The optional request parser transforms `request.body`; its return value replaces the original body.
4. The `preSerialization` hook runs the optional response parser for successful responses. Its returned value becomes the serialized payload.

Error responses with status 400 or higher bypass response parsing. Fastify does not invoke `preSerialization` for strings, buffers, streams, or `null`, so those payloads are not response-validated by these hooks. Use object payloads and Fastify's normal serialization path when response validation is required.

Parser errors are thrown into Fastify's normal lifecycle and reach the configured error handler. The library does not assign HTTP status codes to parser errors; applications should configure their parser or error handler to distinguish client validation failures from response/server failures.

## Encapsulation and ordering

Fastify hooks observe only routes in their encapsulation scope. Call `createSchemaMiddleware` in the same instance/plugin scope before registering routes that should use its route map. Calling it on a parent instance does not imply it will cover routes registered in isolated child plugin scopes.

## TypeScript

Public declarations are in `src/index.d.ts`. The route map determines the parser schema union, and parser context is discriminated by `phase`. Zod-like `_output` types are used to infer parsed URL params where possible. `request.schemaParams` is an optional property added to Fastify's `FastifyRequest` type.

## Repository map

- `src/index.js` — route matching and Fastify hook implementation
- `src/index.d.ts` — public declarations and Fastify request augmentation
- `test/index.test.js` — Jest tests with Fastify `inject()` and direct hook cases
- `examples/zod.js` — runnable Zod example using `inject()`
- `examples/json-schema.js` — runnable Ajv example
- `examples/typescript_zod.ts` — TypeScript usage and type checks
- `README.md` — user-facing package documentation
- `llms.txt` — concise package and source guide

## Development and validation

The package uses ESM and Jest. Keep tests in Jest format, close Fastify instances after each test, and use `fastify.inject()` for HTTP-level behavior.

```sh
npm test
npm run test:coverage
npm run test:types
npm run example:zod
npm run example:json-schema
```

Coverage thresholds are configured in `package.json`. The npm package includes `src`, `examples`, `docs`, and `skills`.
