# Sample Express API

A sample Node.js/Express REST API for the Discovery Agent dry-run testing.

## Features

- User authentication with JWT
- Product catalog management
- Order processing
- MongoDB database
- Rate limiting
- Request validation

## Expected Discoveries

When analyzed by the Code Analyzer, this repository should produce:

### Dependencies

- Express 4.18.2 (Web Framework)
- MongoDB/Mongoose (Database)
- JWT (Authentication)

### Security Findings

- `lodash@4.17.20` has known prototype pollution vulnerability

### Code Metrics

- ~1200 lines of JavaScript code
- 3 main models (User, Product, Order)
- 4 route modules
- Custom middleware implementations

## Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test
```

## Environment Variables

| Variable    | Description               | Default                              |
| ----------- | ------------------------- | ------------------------------------ |
| PORT        | Server port               | 3000                                 |
| MONGODB_URI | MongoDB connection string | mongodb://localhost:27017/sample-app |
| JWT_SECRET  | JWT signing secret        | your-secret-key                      |
| NODE_ENV    | Environment               | development                          |
