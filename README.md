# Atmos

Atmos is a weather-aware travel planning web application for CSU44000 Internet Applications at Trinity College Dublin. This first iteration provides a small Vue interface, an Express server, and a health endpoint; weather and itinerary features are outside its current scope.

The project was configured manually to comply with the assignment's prohibition on Vue CLI, Vite generators, `create-vue`, and other scaffolding systems. The frontend uses Vue 3 directly from a CDN and has no build step.

## Technologies

- HTML5, CSS3, and JavaScript
- Vue 3 browser ES module loaded from a CDN
- Node.js and Express
- Node.js built-in test runner

## Requirements

Use Node.js 22 or a newer maintained LTS release. npm is included with Node.js.

## Project structure

```text
atmos/
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── server/
│   ├── services/
│   └── index.js
├── tests/
│   └── health.test.js
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Setup

Install the dependency:

```sh
npm install
```

Optionally copy `.env.example` to `.env` and change the port:

```sh
cp .env.example .env
```

`OPENWEATHER_API_KEY` may remain empty for this issue. It is reserved for a later server-side integration and must never be placed in `public/` or committed. The default port is `3000`.

## Run the application

Start the server:

```sh
npm start
```

For development with automatic restarts after server-side file changes:

```sh
npm run dev
```

Open <http://localhost:3000> in a browser. Verify the backend at <http://localhost:3000/api/health>; it should return:

```json
{
  "status": "ok",
  "service": "atmos"
}
```

## Tests

Run the backend tests with:

```sh
npm test
```
