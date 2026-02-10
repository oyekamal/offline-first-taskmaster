# Offline-First Task Manager

A production-ready, offline-first task management application built with React, TypeScript, and Dexie.js. Features real-time sync, conflict resolution, and PWA capabilities.

## Features

### Core Functionality
- **Offline-First Architecture**: Works seamlessly offline with IndexedDB storage
- **Real-Time Sync**: Automatic bidirectional synchronization with the backend
- **Conflict Resolution**: Vector clock-based conflict detection with user-friendly resolution UI
- **Infinite Scroll**: Virtualized list rendering for optimal performance with 1000+ tasks
- **Drag & Drop**: Intuitive task reordering with fractional indexing
- **Comments**: Threaded comments with markdown support
- **PWA Support**: Installable as a Progressive Web App

### Technical Features
- **TypeScript**: Fully typed codebase with strict mode
- **React 18+**: Modern React with hooks and concurrent features
- **Dexie.js**: Powerful IndexedDB wrapper with live queries
- **Service Worker**: Offline caching and background sync
- **Optimistic Updates**: Instant UI feedback for all operations
- **Tailwind CSS**: Modern, utility-first styling

## Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── TaskCard.tsx
│   │   ├── TaskForm.tsx
│   │   ├── TaskDetail.tsx
│   │   ├── TaskListVirtualized.tsx
│   │   ├── TaskListDraggable.tsx
│   │   ├── TaskFilters.tsx
│   │   ├── CommentSection.tsx
│   │   ├── SyncStatusIndicator.tsx
│   │   ├── OfflineIndicator.tsx
│   │   └── ConflictResolver.tsx
│   ├── db/                  # Database layer
│   │   ├── index.ts         # Dexie configuration
│   │   └── repositories/    # Repository pattern implementations
│   │       ├── TaskRepository.ts
│   │       └── CommentRepository.ts
│   ├── hooks/               # Custom React hooks
│   │   ├── useTasks.ts
│   │   ├── useComments.ts
│   │   ├── useSync.ts
│   │   └── useOnlineStatus.ts
│   ├── services/            # Business logic services
│   │   ├── apiClient.ts     # HTTP client with auth
│   │   └── syncManager.ts   # Sync orchestration
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/               # Utility functions
│   │   ├── dateFormat.ts
│   │   └── fractionalIndexing.ts
│   ├── App.tsx              # Main application component
│   ├── main.tsx             # Application entry point
│   └── index.css            # Global styles
├── public/
│   ├── sw.js                # Service Worker
│   └── manifest.json        # PWA manifest
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Backend API running on `http://localhost:8000`

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The application will open at `http://localhost:3000`.

### Building for Production

```bash
npm run build
```

The production build will be available in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Usage Guide

### Creating Tasks

1. Click the "New Task" button in the header
2. Fill in the task details:
   - Title (required)
   - Description (supports Markdown)
   - Status (todo, in_progress, done, blocked, cancelled)
   - Priority (low, medium, high, urgent)
   - Due date (optional)
   - Tags (comma-separated)
3. Click "Create Task"

The task is immediately saved to IndexedDB and queued for server sync.

### Offline Mode

When offline:
- All changes are saved locally to IndexedDB
- A yellow indicator shows operations pending sync
- The app continues to function normally
- When back online, changes sync automatically

### Drag & Drop Reordering

1. Switch to "Drag & Drop" view mode
2. Click and drag tasks to reorder
3. Changes are saved automatically using fractional indexing
4. Only the moved task's position is updated (efficient)

### Virtual Scrolling

For large task lists:
1. Switch to "Virtual Scroll" view mode
2. Smooth performance with 1000+ tasks
3. Automatic infinite scroll loading

### Filtering and Searching

Use the left sidebar to:
- Search tasks by title/description
- Filter by status (multiple selection)
- Filter by priority (multiple selection)
- Clear all filters

### Comments

On the task detail page:
- Add comments with Markdown support
- Reply to comments (threaded)
- Edit your own comments
- Delete comments
- Comments sync when online

### Conflict Resolution

If conflicts occur:
1. A modal appears showing the differences
2. Choose to keep your version or the server version
3. Or decide later (conflict remains)
4. Conflicts are shown with a red indicator

## Architecture

### Data Flow

```
User Action
    ↓
React Component
    ↓
Custom Hook
    ↓
Repository Layer
    ↓
IndexedDB (Dexie)
    ↓
Sync Queue
    ↓
Sync Manager
    ↓
API Client
    ↓
Backend Server
```

### Sync Strategy

1. **Local First**: All operations write to IndexedDB first
2. **Queue**: Operations are added to a sync queue
3. **Background Sync**: Automatic sync every 30 seconds when online
4. **Network Recovery**: Automatic sync when network is restored
5. **Conflict Detection**: Vector clocks track causality
6. **User Resolution**: Conflicts presented to user for resolution

### Repository Pattern

The repository layer abstracts data access:
- **TaskRepository**: CRUD operations for tasks
- **CommentRepository**: CRUD operations for comments

Benefits:
- Separation of concerns
- Testability
- Consistent API
- Easy to swap implementations

### Custom Hooks

Business logic is encapsulated in custom hooks:
- **useTasks**: Task CRUD with live updates
- **useComments**: Comment operations
- **useSync**: Sync status and control
- **useOnlineStatus**: Network connectivity

Benefits:
- Reusable logic
- Clean components
- Easy testing
- Type safety

## Performance Optimization

### Virtual Scrolling
- Uses `@tanstack/react-virtual`
- Only renders visible items
- Smooth scrolling with large datasets
- Overscan for preloading

### Code Splitting
- Route-based splitting (future enhancement)
- Vendor chunks for better caching
- Dynamic imports for large components

### Caching Strategy
- **App Shell**: Cache first
- **API Calls**: Network first, cache fallback
- **Assets**: Cache first with network fallback

### IndexedDB Indexes
Optimized queries with indexes on:
- `status`, `priority`, `assigned_to`
- `created_at`, `updated_at`, `due_date`
- `position` for ordering

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

## Environment Variables

Create a `.env` file:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_DEVICE_NAME=My Device
```

## Troubleshooting

### IndexedDB Issues

Clear IndexedDB data:
```javascript
// In browser console
indexedDB.deleteDatabase('TaskManagerDB');
location.reload();
```

### Sync Issues

Force full sync:
1. Open browser DevTools
2. Console: `window.location.reload(true)`

### Service Worker Issues

Unregister service worker:
```javascript
// In browser console
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(reg => reg.unregister());
});
```

## Development

### Adding New Features

1. Add TypeScript types in `src/types/`
2. Update database schema in `src/db/`
3. Create/update repositories
4. Create custom hooks
5. Build React components
6. Update sync manager if needed

### Testing Offline Mode

Chrome DevTools:
1. Open DevTools
2. Network tab
3. Select "Offline" from throttling dropdown

### Debugging Sync

Enable verbose logging:
```typescript
// In src/services/syncManager.ts
const DEBUG = true;
```

## Security Considerations

- JWT tokens stored in localStorage (consider httpOnly cookies for production)
- Device ID for tracking sync state
- CORS configured for localhost (update for production)
- No sensitive data in IndexedDB (encrypted if needed)

## Future Enhancements

- [ ] Real-time collaboration with WebSockets
- [ ] File attachments for tasks
- [ ] Task templates
- [ ] Advanced search with filters
- [ ] Dashboard with analytics
- [ ] Mobile app (React Native)
- [ ] Desktop app (Electron)
- [ ] Export/import functionality

## License

MIT License - See LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## Support

For issues and questions:
- GitHub Issues
- Email: support@example.com
- Documentation: https://docs.example.com
