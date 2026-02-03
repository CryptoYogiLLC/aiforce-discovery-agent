# Sample React Frontend

A sample React/TypeScript e-commerce frontend for the Discovery Agent dry-run testing.

## Features

- React 18 with TypeScript
- React Router for navigation
- TanStack Query for data fetching
- Zustand for state management
- Vite for building

## Expected Discoveries

When analyzed by the Code Analyzer, this repository should produce:

### Dependencies

- React 18.2.0 (UI Framework)
- TypeScript (Language)
- Vite (Build Tool)
- React Query (Data Fetching)

### Code Metrics

- ~800 lines of TypeScript/TSX code
- 8 page/component files
- 2 custom hooks (stores)
- API service layer
- Type definitions

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Environment Variables

The app expects a backend API at `/api`. Configure the Vite proxy in development or set up nginx in production.
