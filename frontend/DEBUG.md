# Debugging Blank Page Issue

## Step 1: Check Browser Console
1. Open `http://localhost:5173` in your browser
2. Press F12 to open Developer Tools
3. Go to the **Console** tab
4. Look for any red error messages
5. **Copy and share any errors you see**

## Step 2: Check Network Tab
1. In Developer Tools, go to the **Network** tab
2. Refresh the page
3. Look for:
   - Failed requests (red)
   - Missing files (404 errors)
   - CORS errors

## Step 3: Verify Dev Server Output
Check your terminal where you ran `yarn dev`. You should see:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network:  use --host to expose
```

If you see errors in the terminal, share them.

## Step 4: Check if Files are Loading
In the browser Network tab, verify these files are loading:
- `/src/main.tsx`
- `/src/App.tsx`
- `/src/index.css`

## Step 5: Try These Commands

```bash
# Stop the dev server (Ctrl+C)
# Clear Vite cache
cd frontend
rm -rf node_modules/.vite
rm -rf dist

# Reinstall dependencies
yarn install

# Restart dev server
yarn dev
```

## Step 6: Check for TypeScript Errors
```bash
cd frontend
yarn build
```

If there are TypeScript errors, fix them first.

## Step 7: Test with Simple Component
If nothing works, we can temporarily replace App.tsx with a simple test component to verify React is working.

## Common Issues:

1. **Port already in use**: Try `yarn dev --port 3000`
2. **Node modules issue**: Delete `node_modules` and `yarn.lock`, then `yarn install`
3. **Browser cache**: Hard refresh with Ctrl+Shift+R (or Cmd+Shift+R on Mac)
4. **CORS error**: Make sure backend is running on port 8000

## What to Share:
1. Browser console errors (screenshot or copy text)
2. Terminal output from `yarn dev`
3. Network tab errors (if any)
4. Any TypeScript/build errors

