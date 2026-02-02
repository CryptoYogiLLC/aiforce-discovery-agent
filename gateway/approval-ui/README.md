# Approval UI

**Language:** TypeScript
**Framework:** React + Vite
**Port:** 3000
**Status:** ✅ Implemented

## Purpose

Web-based user interface for reviewing and approving discovery events before transmission to AIForce Assess. Provides a dashboard for viewing, filtering, and managing discovered resources.

## Features

- [x] Discovery list with pagination
- [x] Status filtering (pending/approved/rejected)
- [x] Discovery detail view with full JSON payload
- [x] Single approve/reject workflow
- [x] Bulk selection and approval
- [x] Rejection reason modal
- [x] Audit history per discovery
- [x] Responsive design
- [x] Loading states and error handling
- [ ] Local authentication (planned)
- [ ] Preview mode (planned)

## Pages

### Discovery List (`/`)

- Paginated table of all discoveries
- Filter by status (pending, approved, rejected)
- Checkbox selection for bulk operations
- Quick view link to detail page

### Discovery Detail (`/discovery/:id`)

- Full discovery metadata
- JSON payload viewer
- Approve/Reject buttons (for pending items)
- Audit history timeline

## Configuration

The UI proxies API requests to the backend during development:

| Variable       | Default | Description                       |
| -------------- | ------- | --------------------------------- |
| `VITE_API_URL` | `/api`  | API base URL (proxied to backend) |

In production (nginx), API requests are proxied to `approval-api:3001`.

## Development

```bash
cd gateway/approval-ui
npm install
npm run dev
```

The dev server starts at http://localhost:3000 with hot module reloading.

## Production Build

```bash
npm run build
npm run preview  # Preview production build
```

## Docker

```bash
# Build
docker build -t approval-ui .

# Run
docker run -p 80:80 approval-ui
```

The production image uses nginx to:

- Serve static files
- Proxy `/api` requests to the backend
- Handle SPA routing

## Testing

```bash
npm run test
```

## Project Structure

```
gateway/approval-ui/
├── src/
│   ├── main.tsx           # React entry point
│   ├── App.tsx            # Root component with routing
│   ├── index.css          # Global styles
│   ├── types/
│   │   └── index.ts       # TypeScript interfaces
│   ├── services/
│   │   └── api.ts         # API client
│   ├── pages/
│   │   ├── DiscoveryList.tsx
│   │   └── DiscoveryDetail.tsx
│   └── components/
│       ├── StatusBadge.tsx
│       ├── Pagination.tsx
│       └── RejectModal.tsx
├── public/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── nginx.conf             # Production nginx config
└── Dockerfile
```

## UI Components

### StatusBadge

Displays discovery status with appropriate styling:

- Pending: Yellow badge
- Approved: Green badge
- Rejected: Red badge

### Pagination

Navigation component for paginated lists with:

- Previous/Next buttons
- Page number links
- Ellipsis for large page counts

### RejectModal

Modal dialog for rejection workflow:

- Required reason textarea
- Confirm/Cancel buttons
- Loading state handling
