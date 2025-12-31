# Troubleshooting Blank Page

If you're seeing a blank page, try these steps:

## 1. Check Browser Console
Open your browser's developer tools (F12) and check the Console tab for any JavaScript errors.

## 2. Verify Dev Server is Running
Make sure the frontend dev server is running:
```bash
cd frontend
yarn dev
# or
npm run dev
```

The app should be available at `http://localhost:5173`

## 3. Check Backend is Running
Make sure the backend API is running:
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```

The API should be available at `http://localhost:8000`

## 4. Clear Browser Cache
- Clear your browser cache and localStorage
- Or open in incognito/private mode

## 5. Check Network Tab
In browser dev tools, check the Network tab to see if:
- API requests are failing
- JavaScript files are loading correctly
- CORS errors are present

## 6. Verify Dependencies
Make sure all dependencies are installed:
```bash
cd frontend
yarn install
# or
npm install
```

## 7. Check Routes
- If not logged in, you should see the Login page at `/login`
- If logged in, you should see the Dashboard at `/dashboard`
- Try navigating directly to `http://localhost:5173/login`

## Common Issues

### CORS Errors
If you see CORS errors, make sure:
- Backend CORS is configured to allow `http://localhost:5173`
- Backend is running on port 8000

### Authentication Issues
- Clear localStorage: `localStorage.clear()` in browser console
- Try registering a new account
- Check if backend database is set up correctly

### Import Errors
- Make sure all files exist in the correct locations
- Check for TypeScript compilation errors: `yarn build`

