---
name: fastify-schema
description: "Use fastify.schema to validate Fastify URL params, request bodies, and serialized responses with route-based matching and a custom parser, Zod, or Ajv; also use when maintaining this package."
---

# fastify.schema

## What this package does

`fastify.schema` registers route-based validation hooks on a Fastify instance:

```js
createSchemaMiddleware(fastify, { routes, parse })
```

It adapts a route map to the Fastify lifecycle and delegates validation and transformation to the supplied parser. Fastify is a peer dependency; Zod, Ajv, and custom parsers are optional.

## Install and setup

```sh
npm install fastify.schema fastify
npm install zod
```

Register hooks before covered routes and keep them in the same Fastify encapsulation scope:

```js
const app = Fastify();
createSchemaMiddleware(app, { routes, parse });
app.get('/users/:id', handler);
```

## Route definitions

```js
const routes = {
  'GET /users/:id': {
    urlParams: userParamsSchema,
    response: userResponseSchema,
  },
  'POST /users': {
    request: createUserSchema,
    response: userResponseSchema,
  },
  'GET /users?active=true&id=:id': {
    urlParams: userParamsSchema,
  },
};
```

- Keys use `METHOD /path`, optionally with query patterns.
- Methods are case-insensitive.
- Static path segments match exactly. `:name` captures one non-empty segment.
- Listed query params must be present; placeholders capture strings, literal values must match exactly, and unlisted params are ignored.
- Use schema coercion such as `z.coerce.number()` when a string capture should become a number.

## Parser behavior and lifecycle

The parser signature is `(schema, data, context)` and supports promises. `context.phase` is `'urlParams'`, `'request'`, or `'response'`; it also contains `request`, `reply`, and `params`.

1. `preValidation` parses URL params first. Its parser must return a non-null, non-array object. The parsed object is stored at `request.schemaParams`.
2. `preValidation` parses the request body next. The parser's return value replaces `request.body`.
3. `preSerialization` parses successful response payloads, and the returned payload continues through Fastify serialization.

URL captures initially contain strings. The `urlParams` parser context receives the original captures; subsequent phases receive the parsed params object. Responses with status 400 or greater bypass response parsing. Fastify does not run `preSerialization` for strings, buffers, streams, or `null`, so response schemas apply only to eligible serialized payloads.

Parser errors follow Fastify's normal error-handling lifecycle. Assign status codes or map errors in the parser/application error handler; request validation can be a 400, while invalid server responses should generally remain server errors. Unmatched requests are unchanged.

## Troubleshooting

- Register the hooks before the routes and in their Fastify encapsulation scope.
- Check method, path segment count, and the presence/value of query params.
- Remember URL captures are strings until transformed by the `urlParams` parser.
- Response validation requires an object payload going through Fastify serialization; strings, buffers, streams, and `null` skip `preSerialization`.
- Set validation error status codes in the parser or Fastify error handler; the middleware does not assign them.

## Maintaining this repository

Relevant files:

- `src/index.js`: matcher, `preValidation` and `preSerialization` hooks
- `src/index.d.ts`: route/parser types and `FastifyRequest` augmentation
- `src/utils.schema/`: shared route parsing/matching Git submodule
- `test/index.test.js`: Jest tests and Fastify `inject()` integration
- `examples/`: Zod, Ajv, and TypeScript examples
- `docs/agent-guide.md`: hook flow, encapsulation, and development notes

Validation:

```sh
npm run submodule:init
npm test
npm run test:coverage
npm run test:types
npm run example:zod
npm run example:json-schema
```

The parent repository pins the submodule to a specific commit. Initialize that pinned revision after a normal clone with `npm run submodule:init` or `git submodule update --init --recursive`. Use `npm run submodule:update` only for an intentional upgrade to the configured remote branch; review and commit the resulting `src/utils.schema` gitlink. CI initializes the pinned revision, not the latest remote version.

The published package includes the initialized submodule files under `src`; consumers do not install the submodule separately. Initialize it before packing or publishing, and verify the tarball with `npm pack --dry-run`.

Keep the package ESM, preserve Fastify lifecycle and encapsulation behavior, close test instances, and add regression coverage for behavior changes. Jest coverage thresholds are 100% for statements, branches, functions, and lines.
