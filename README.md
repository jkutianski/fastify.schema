# ![fastify.schema](logo.svg) ![License](https://badgen.net/github/license/jkutianski/fastify.schema) ![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/jkutianski/fastify.schema/ci.yml) ![NPM Version](https://badgen.net/npm/v/fastify.schema)

Route-based runtime validation hooks for Fastify. Define schemas by HTTP method and path, then validate captured URL parameters, request bodies, and response payloads with Zod, JSON Schema/Ajv, or a custom parser.

The package does not depend on a particular schema library. Fastify is a peer dependency.

## Install

```sh
npm install fastify.schema fastify
```

Install a validator separately, such as `npm install zod`.

## Shared utilities and repository setup

The route parser and matcher are maintained in the [`utils.schema` repository](https://github.com/jkutianski/utils.schema) and included here as the `src/utils.schema` Git submodule. The published `fastify.schema` package includes the required utility source; package consumers do not need to install or initialize the submodule separately.

Clone this repository with its submodule:

```sh
git clone --recurse-submodules https://github.com/jkutianski/fastify.schema.git
```

If you already cloned the repository without submodules, initialize the pinned revision with either command:

```sh
git submodule update --init --recursive
# or
npm run submodule:init
```

To intentionally advance the submodule to the latest commit on its configured remote branch (`main`), run:

```sh
npm run submodule:update
```

Review and commit the updated gitlink in the parent repository so other clones use the same revision:

```sh
git status
git add src/utils.schema
git commit -m "Update utils.schema submodule"
```

CI initializes the revision pinned by the parent repository rather than tracking the latest remote commit. Before packing or publishing from a Git checkout, initialize the submodule and check the package contents with `npm pack --dry-run`.

## Usage

```js
import Fastify from 'fastify';
import { z } from 'zod';
import { createSchemaMiddleware } from 'fastify.schema';

const app = Fastify();

createSchemaMiddleware(app, {
  routes: {
    'POST /users': {
      request: z.object({ name: z.string().min(1) }),
      response: z.object({ id: z.number(), name: z.string() }),
    },
    'GET /users/:id': {
      urlParams: z.object({ id: z.coerce.number() }),
      response: z.object({ id: z.number(), name: z.string() }),
    },
  },
  parse: (schema, data) => schema.parse(data),
});

app.post('/users', async (request, reply) => ({
  id: 1,
  ...request.body,
}));

app.get('/users/:id', async (request) => ({
  id: request.schemaParams.id,
  name: 'Ada',
}));

await app.listen({ port: 3000 });
```

Install hooks on a Fastify instance before registering the routes they should apply to. Hooks follow Fastify encapsulation: install the middleware and define its routes in the same Fastify scope.

Runnable examples are available for [Zod](examples/zod.js), [JSON Schema/Ajv](examples/json-schema.js), and [TypeScript with Zod](examples/typescript_zod.ts). Run the JavaScript examples with `npm run example:zod` or `npm run example:json-schema`; they use Fastify's `inject()` and do not need a network server.

## Route matching and parsing

Route keys use `METHOD /path` syntax. Methods are case-insensitive, static path segments match exactly, and `:name` segments capture one non-empty path segment. Optional query parameters can be matched too, for example `GET /users?active=true&id=:id`; additional query parameters are ignored.

The `preValidation` hook parses URL params first and the request body next. Parsed URL params are exposed as `request.schemaParams` and passed to later phases. The `preSerialization` hook parses successful response payloads and sends its returned value through Fastify's serializer. Error responses (status 400 or higher) are passed through unchanged. Response parsing applies to object payloads handled by Fastify serialization; Fastify does not call `preSerialization` for strings, buffers, streams, or `null`.

The parser receives `(schema, data, context)` and may be asynchronous. `context.phase` is `'urlParams'`, `'request'`, or `'response'`; each context includes Fastify's `request` and `reply` objects and the captured or parsed `params`. Parser errors are thrown through Fastify's normal error-handling lifecycle and reach the configured error handler. Choose the status code in your parser or error handler as appropriate; validation errors in the examples are mapped to 400, while response validation failures remain server errors.

If a route does not match, the hooks leave its request and response unchanged.

## API

```js
createSchemaMiddleware(fastify, { routes, parse })
```

- `fastify`: Fastify instance on which to register the hooks.
- `routes`: map of route keys to optional `urlParams`, `request`, and `response` schemas.
- `parse(schema, data, context)`: synchronous or asynchronous parser. Its returned value replaces parsed params, the request body, or the serialized response payload.
- Returns the Fastify instance.

TypeScript declarations are included. Run `npm test` and `npm run test:types` to validate the package and examples.

For implementation details and repository guidance, see the [agent guide](docs/agent-guide.md) and the [fastify.schema skill](skills/fastify-schema/SKILL.md).
