# Quick Test: Device ID Fix

## Step-by-Step Verification

### 1. Clear Browser Data

Open browser console and run:

```javascript
// Clear everything to start fresh
localStorage.clear();
indexedDB.deleteDatabase('TaskManagerDB');
location.reload();
```

### 2. Check Initial State

```javascript
// Should be null (not logged in yet)
console.log('Fingerprint:', localStorage.getItem('device_fingerprint'));
console.log('Server Device ID:', localStorage.getItem('server_device_id'));
```

Expected output:
```
Fingerprint: null
Server Device ID: null
```

### 3. Login

Use the UI to login with your credentials.

### 4. Verify Device ID is Saved

```javascript
// Check localStorage after login
console.log('Fingerprint:', localStorage.getItem('device_fingerprint'));
console.log('Server Device ID:', localStorage.getItem('server_device_id'));
```

Expected output:
```
Fingerprint: "abc-123-xyz..." (some UUID)
Server Device ID: "def-456-uvw..." (different UUID from backend)
```

### 5. Check Network Request

Go to DevTools → Network tab, and trigger a sync or wait for automatic sync.

Look for: `GET /api/sync/pull/?since=...`

**Check Request Headers:**
```
X-Device-ID: def-456-uvw...  ✅ Should match server_device_id
```

### 6. Verify No Errors

Check the response:

**✅ SUCCESS:**
```json
{
  "tasks": [...],
  "comments": [...],
  "tombstones": [...],
  "serverVectorClock": {...},
  "hasMore": false,
  "timestamp": 1234567890
}
```

**❌ BEFORE (Old Error):**
```json
{
  "error": "Invalid device ID"
}
```

### 7. Console Logs

Should see:
```
✅ Starting sync...
✅ Pulled X tasks, Y comments, Z tombstones from server
✅ Sync completed successfully
```

### 8. Test Sync Push

Create a task offline:
```javascript
// This should queue the task for sync
// Next sync cycle should push it
```

Check network for: `POST /api/sync/push/`

Should see **200 OK** response.

### 9. Multi-Tab Test

1. Open app in 2 tabs
2. Both should use same device ID
3. Sync should work in both tabs

```javascript
// In both tabs, check:
console.log('Device ID:', localStorage.getItem('server_device_id'));
// Should be SAME in both tabs
```

### 10. Logout/Login Test

1. Logout
2. Check localStorage (server_device_id should be cleared)
3. Login again
4. Should get SAME device ID (because fingerprint is preserved)

```javascript
// After logout
console.log('Server Device ID:', localStorage.getItem('server_device_id'));
// Should be: null

console.log('Fingerprint:', localStorage.getItem('device_fingerprint'));
// Should still exist (not cleared)

// After login again
console.log('Server Device ID:', localStorage.getItem('server_device_id'));
// Should be back (same value as before)
```

---

## Quick Debug Script

Copy and paste this into browser console to check everything:

```javascript
async function checkDeviceIdSetup() {
  console.log('=== Device ID Debug Info ===');
  
  // Check localStorage
  const fingerprint = localStorage.getItem('device_fingerprint');
  const serverDeviceId = localStorage.getItem('server_device_id');
  const accessToken = localStorage.getItem('access_token');
  
  console.log('1. LocalStorage:');
  console.log('   Fingerprint:', fingerprint || '❌ Not set');
  console.log('   Server Device ID:', serverDeviceId || '❌ Not set');
  console.log('   Access Token:', accessToken ? '✅ Present' : '❌ Missing');
  
  // Check if authenticated
  console.log('\n2. Authentication:');
  if (!accessToken) {
    console.log('   ❌ Not logged in');
    return;
  }
  console.log('   ✅ Logged in');
  
  // Check device ID in use
  console.log('\n3. Device ID in use:');
  const currentDeviceId = serverDeviceId || fingerprint;
  console.log('   Current:', currentDeviceId);
  
  // Try a test API call
  console.log('\n4. Testing API call...');
  try {
    const response = await fetch('http://localhost:8000/api/sync/pull/?since=0&limit=10', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Device-ID': currentDeviceId
      }
    });
    
    if (response.ok) {
      console.log('   ✅ Sync API call successful!');
      const data = await response.json();
      console.log('   Response:', data);
    } else {
      console.log('   ❌ Sync API call failed');
      const error = await response.json();
      console.log('   Error:', error);
    }
  } catch (err) {
    console.log('   ❌ Network error:', err);
  }
  
  console.log('\n=== End Debug Info ===');
}

// Run the check
checkDeviceIdSetup();
```

---

## Expected Console Output (Success)

```
=== Device ID Debug Info ===
1. LocalStorage:
   Fingerprint: "a1b2c3d4-..."
   Server Device ID: "e5f6g7h8-..."
   Access Token: ✅ Present

2. Authentication:
   ✅ Logged in

3. Device ID in use:
   Current: e5f6g7h8-...

4. Testing API call...
   ✅ Sync API call successful!
   Response: {tasks: Array(0), comments: Array(0), tombstones: Array(0), ...}

=== End Debug Info ===
```

---

## Common Issues

### Issue 1: Still getting "Invalid device ID"

**Check:**
```javascript
console.log('Fingerprint:', localStorage.getItem('device_fingerprint'));
console.log('Server ID:', localStorage.getItem('server_device_id'));
```

**Fix:** Clear and login again:
```javascript
localStorage.clear();
location.reload();
// Then login
```

### Issue 2: No device info in login response

**Check backend logs:**
```bash
cd backend/
tail -f logs/django.log
```

**Verify device creation:**
```python
python manage.py shell
>>> from core.models import Device
>>> Device.objects.all()
```

### Issue 3: Different device ID each time

**Check:** Fingerprint should be consistent:
```javascript
// This should NOT change between page reloads
localStorage.getItem('device_fingerprint')
```

If it changes, check if localStorage is being cleared somewhere.

---

## Success Criteria

All of these should be ✅:

- [ ] Login returns device info
- [ ] `localStorage.server_device_id` is set after login
- [ ] `X-Device-ID` header uses server device ID
- [ ] `/api/sync/pull/` returns 200 OK
- [ ] `/api/sync/push/` returns 200 OK
- [ ] No "Invalid device ID" errors
- [ ] Sync completes successfully
- [ ] Multi-tab sync works
- [ ] Logout clears server device ID
- [ ] Re-login restores device ID

---

**Status:** Ready for testing ✅
