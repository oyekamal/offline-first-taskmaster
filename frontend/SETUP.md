# Setup Guide

This guide will help you set up and run the Offline-First Task Manager frontend application.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18 or higher
- **npm**: Version 9 or higher (comes with Node.js)
- **Backend API**: The Django backend should be running on `http://localhost:8000`

Check your versions:
```bash
node --version  # Should be v18.x or higher
npm --version   # Should be 9.x or higher
```

## Quick Start

### 1. Install Dependencies

Navigate to the frontend directory and install all dependencies:

```bash
cd /home/oye/Documents/offline_first_architecture/frontend
npm install
```

This will install:
- React 18 and React DOM
- TypeScript and type definitions
- Dexie.js for IndexedDB
- TanStack Virtual and DnD Kit for UI
- Tailwind CSS for styling
- Vite for building and development
- And many other dependencies

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` if needed to match your backend URL:

```env
VITE_API_BASE_URL=http://localhost:8000
```

### 3. Start Development Server

Run the development server:

```bash
npm run dev
```

The application will open automatically at `http://localhost:3000`.

You should see:
- The task manager interface
- A sync status indicator in the header
- An offline indicator if you're offline
- Empty task list (ready for you to create tasks)

## Verifying the Installation

### Test Offline Functionality

1. Open Chrome DevTools (F12)
2. Go to the Network tab
3. Change throttling to "Offline"
4. Create a task
5. You should see a yellow indicator showing it's pending sync
6. Switch back to "Online"
7. The task should sync automatically

### Test Service Worker

1. Open Chrome DevTools (F12)
2. Go to Application tab
3. Click "Service Workers" in the left sidebar
4. You should see the service worker registered and active

### Test IndexedDB

1. Open Chrome DevTools (F12)
2. Go to Application tab
3. Click "IndexedDB" in the left sidebar
4. Expand "TaskManagerDB"
5. You should see tables: tasks, comments, sync_queue, device_info

## Common Issues and Solutions

### Port 3000 Already in Use

If port 3000 is already in use, you can change it in `vite.config.ts`:

```typescript
server: {
  port: 3001,  // Change to any available port
  open: true
}
```

### Backend Connection Issues

If you see CORS errors:
1. Ensure backend is running on `http://localhost:8000`
2. Check that CORS is configured in backend to allow `http://localhost:3000`
3. Check network tab in DevTools for specific error messages

### IndexedDB Not Working

If IndexedDB doesn't work:
1. Ensure you're not in Private/Incognito mode
2. Check browser console for errors
3. Try clearing site data and refreshing

### Build Errors

If you encounter build errors:

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf node_modules/.vite
npm run dev
```

## Development Workflow

### Hot Module Replacement (HMR)

Vite provides instant HMR. When you save a file:
- React components update without full page reload
- State is preserved
- Changes appear instantly

### TypeScript

TypeScript is checked during build:

```bash
npm run build
```

For continuous type checking during development:

```bash
# In a separate terminal
npx tsc --watch --noEmit
```

### Linting

Lint your code:

```bash
npm run lint
```

### Building for Production

Create a production build:

```bash
npm run build
```

The build output will be in the `dist/` directory.

Preview the production build:

```bash
npm run preview
```

## Project Structure Overview

```
frontend/
├── src/
│   ├── components/      # React UI components
│   ├── db/             # IndexedDB with Dexie.js
│   ├── hooks/          # Custom React hooks
│   ├── services/       # Business logic (API, Sync)
│   ├── types/          # TypeScript definitions
│   ├── utils/          # Helper functions
│   ├── App.tsx         # Main app component
│   ├── main.tsx        # Entry point
│   └── index.css       # Global styles
├── public/
│   ├── sw.js          # Service Worker
│   └── manifest.json  # PWA manifest
└── Configuration files
```

## Key Features to Test

### 1. Task Management
- Create new tasks
- Edit existing tasks
- Delete tasks
- Drag and drop to reorder

### 2. Filtering and Search
- Filter by status
- Filter by priority
- Search by title/description
- Clear filters

### 3. Comments
- Add comments to tasks
- Edit your comments
- Reply to comments (threading)
- View comment threads

### 4. Sync
- Work offline
- Automatic sync when online
- Manual sync button
- Pending operations counter

### 5. Conflict Resolution
- Create conflicts (edit same task offline and online)
- Resolve conflicts with UI
- Choose local or server version

### 6. PWA
- Install as app (desktop/mobile)
- Works offline after installation
- App-like experience

## Next Steps

1. **Read the README**: Full documentation in `README.md`
2. **Explore the code**: Start with `App.tsx` and follow the data flow
3. **Test features**: Try all the offline-first capabilities
4. **Customize**: Modify components to fit your needs
5. **Deploy**: Build and deploy to your hosting platform

## Getting Help

If you encounter issues:

1. Check the browser console for errors
2. Check the Network tab for failed requests
3. Review the `README.md` for troubleshooting
4. Check IndexedDB state in DevTools
5. Verify service worker is registered

## Performance Tips

For best performance:

1. **Use Virtual Scrolling**: For lists with 100+ items
2. **Limit Filters**: Too many active filters can slow queries
3. **Regular Sync**: Keep sync queue small
4. **Clear Old Data**: Periodically delete old completed tasks

## Security Notes

This is a development setup. For production:

1. Use HTTPS
2. Implement proper authentication
3. Use httpOnly cookies for tokens
4. Enable CSP (Content Security Policy)
5. Update CORS settings
6. Add rate limiting
7. Encrypt sensitive data in IndexedDB

## Additional Resources

- [Dexie.js Documentation](https://dexie.org/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

---

Happy coding! If you have questions or run into issues, refer to the troubleshooting section or the main README.
