# Approval Gateway UI

**Language:** TypeScript / React
**Owner:** Dev 5
**Status:** 🚧 In Progress

## Purpose

Web interface for reviewing and approving discovered data before transmission.

## Features

- [ ] Discovery results browser (filter, search, drill-down)
- [ ] Approval workflow (approve/reject/redact individual items)
- [ ] Batch approval for bulk operations
- [ ] Audit log viewer
- [ ] Preview mode (see what would be sent)
- [ ] Local authentication

## Development

```bash
cd gateway/approval-ui
npm install
npm run dev
# Access at http://localhost:3000
```

## Testing

```bash
npm run test
npm run test:e2e
```

## Build

```bash
npm run build
docker build -t discovery-approval-ui .
```
