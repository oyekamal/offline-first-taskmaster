# Quick Start Guide

Get up and running in 5 minutes!

## Prerequisites Check

```bash
# Check Node.js version (need 18+)
node --version

# Check npm version (need 9+)
npm --version

# Verify backend is running
curl http://localhost:8000/api/tasks/
```

If backend is not running, start it first from the backend directory.

## Installation (1 minute)

```bash
# Navigate to frontend directory
cd /home/oye/Documents/offline_first_architecture/frontend

# Install dependencies
npm install
```

This will install all required packages including React, TypeScript, Dexie.js, and more.

## Start Development Server (30 seconds)

```bash
# Start the dev server
npm run dev
```

The application will automatically open at `http://localhost:3000`.

## First Steps (2 minutes)

### 1. Create Your First Task

1. Click the **"New Task"** button in the top-right corner
2. Fill in:
   - **Title**: "Welcome to the Task Manager"
   - **Description**: "This is my first task!"
   - **Status**: todo
   - **Priority**: medium
3. Click **"Create Task"**

Your task appears immediately! Notice the yellow indicator showing it's pending sync.

### 2. Test Offline Mode

1. Open **Chrome DevTools** (F12)
2. Go to the **Network** tab
3. Select **"Offline"** from the throttling dropdown
4. Create another task
5. Notice the offline indicator at the top
6. Switch back to **"Online"**
7. Watch the task sync automatically

### 3. Add Comments

1. Click on any task to open details
2. Scroll to the **Comments** section
3. Type a comment and click **"Post Comment"**
4. Try replying to a comment
5. Edit a comment by clicking **"Edit"**

### 4. Try Drag & Drop

1. Make sure you're in **"Drag & Drop"** view mode (toggle in header)
2. Click and drag a task card
3. Drop it in a new position
4. Position is saved automatically!

### 5. Filter and Search

1. Open the **Filters** sidebar on the left
2. Try searching for a task
3. Filter by status (select multiple)
4. Filter by priority
5. Click **"Clear all"** to reset

## Quick Commands

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build

# Code Quality
npm run lint         # Run ESLint
npx tsc --noEmit    # Check TypeScript types

# Testing Structure
./verify-structure.sh # Verify all files are in place
```

## Keyboard Shortcuts (Future)

Coming soon:
- `Ctrl/Cmd + K` - Quick search
- `N` - New task
- `?` - Show shortcuts
- `Esc` - Close modal

## Common Issues

### Port Already in Use

```bash
# Use a different port
# Edit vite.config.ts and change:
server: { port: 3001 }
```

### Backend Not Responding

```bash
# Check backend is running
curl http://localhost:8000/api/tasks/

# Check CORS configuration in backend
# Should allow http://localhost:3000
```

### Service Worker Not Registering

1. Open DevTools > Application > Service Workers
2. Check if it's registered
3. Try **"Unregister"** and refresh page
4. Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)

## Understanding the UI

### Header
- **Task Manager** - App title
- **View Toggle** - Switch between Drag & Drop and Virtual Scroll
- **Sort Dropdown** - Change task ordering
- **New Task Button** - Create new task

### Sync Status Bar
- **Green with checkmark** - All synced
- **Blue with spinner** - Currently syncing
- **Yellow with number** - N pending operations
- **Gray** - Offline mode
- **Red** - Conflicts detected

### Task Card
- **Yellow left border** - Not synced yet
- **Red left border** - Has conflict
- **Status badge** - Current status (color-coded)
- **Priority badge** - Priority level (color-coded)
- **Calendar icon** - Due date (red if overdue)
- **Comment icon** - Comment count
- **User icon** - Assigned person

### Filters Sidebar
- **Search box** - Full-text search
- **Status checkboxes** - Filter by status
- **Priority checkboxes** - Filter by priority
- **Clear all** - Reset all filters

## Architecture at a Glance

```
User Action
    ↓
React Component (UI)
    ↓
Custom Hook (Logic)
    ↓
Repository (Data Access)
    ↓
IndexedDB (Local Storage)
    ↓
Sync Queue
    ↓
API Client
    ↓
Backend Server
```

## Data Flow Example: Creating a Task

1. User fills form in `TaskForm.tsx`
2. Submits → calls `useTaskMutations().createTask()`
3. Hook calls `TaskRepository.create()`
4. Repository:
   - Generates UUID
   - Adds to IndexedDB
   - Adds to sync queue
   - Returns task immediately
5. UI updates instantly (optimistic)
6. Background sync picks up from queue
7. Sends to API via `apiClient`
8. Server confirms
9. Updates IndexedDB as "synced"
10. Removes from sync queue

## What to Explore Next

### For Developers

1. **Read the code**:
   - Start with `src/App.tsx`
   - Look at `src/db/index.ts` for database setup
   - Check `src/services/syncManager.ts` for sync logic

2. **Inspect in DevTools**:
   - Application tab → IndexedDB → TaskManagerDB
   - Network tab → See API calls
   - Application tab → Service Workers

3. **Experiment**:
   - Add a new field to Task type
   - Create a new component
   - Modify the sync interval
   - Add a new filter option

### For Product Managers

1. **Test features**:
   - Create, edit, delete tasks
   - Test offline mode extensively
   - Try conflict resolution
   - Check mobile responsiveness

2. **Check performance**:
   - Create 100+ tasks
   - Test virtual scrolling
   - Check sync performance
   - Monitor network tab

3. **Evaluate UX**:
   - Is it intuitive?
   - Are errors clear?
   - Is feedback immediate?
   - Are loading states smooth?

## Customization Tips

### Change Theme Colors

Edit `tailwind.config.js`:
```javascript
theme: {
  extend: {
    colors: {
      primary: {
        600: '#your-color',
      }
    }
  }
}
```

### Add New Task Status

1. Edit `src/types/index.ts`:
```typescript
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled' | 'on_hold';
```

2. Update `TaskForm.tsx` status options

3. Add color in `TaskCard.tsx` statusColors

### Modify Sync Interval

Edit `src/services/syncManager.ts`:
```typescript
this.syncInterval = window.setInterval(() => {
  // Change 30000 (30 seconds) to your desired interval
  if (navigator.onLine && !this.isSyncing) {
    this.sync();
  }
}, 60000); // 60 seconds
```

## Production Deployment

When ready to deploy:

1. **Build for production**:
```bash
npm run build
```

2. **Test the build**:
```bash
npm run preview
```

3. **Deploy the `dist/` folder** to your hosting:
   - Netlify
   - Vercel
   - AWS S3 + CloudFront
   - Firebase Hosting
   - Your own server

4. **Update environment variables**:
   - Change API URL to production backend
   - Update CORS settings
   - Configure proper authentication

5. **Enable HTTPS** (required for PWA)

## Learning Resources

- **Dexie.js**: https://dexie.org/
- **React Docs**: https://react.dev/
- **TypeScript**: https://www.typescriptlang.org/docs/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Service Workers**: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

## Getting Help

- **Check Console**: Browser DevTools → Console tab
- **Check Network**: Browser DevTools → Network tab
- **Check Storage**: Browser DevTools → Application tab → IndexedDB
- **Read README.md**: Comprehensive documentation
- **Read FEATURES.md**: Feature details
- **Check Issues**: GitHub issues (if applicable)

## Next Steps

1. ✅ **Complete this quick start**
2. 📖 **Read README.md** for full documentation
3. 🔍 **Explore the code** starting with App.tsx
4. 🧪 **Test offline capabilities** thoroughly
5. 🎨 **Customize** to your needs
6. 🚀 **Deploy** to production

---

**You're all set!** Start creating tasks and exploring the features. The app works completely offline, so feel free to disconnect and keep working!

Need more details? Check out:
- `README.md` - Complete documentation
- `SETUP.md` - Detailed setup guide
- `FEATURES.md` - Feature documentation
- `FILE_SUMMARY.md` - Project structure overview
