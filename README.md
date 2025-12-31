# No-Code Platform

A full-stack no-code platform for building web projects with a visual editor.

## Features

- User authentication (register/login)
- Project management (create, edit, delete projects)
- Visual editor with HTML/CSS editing
- Live preview
- Component tree storage

## Tech Stack

### Backend
- FastAPI
- SQLAlchemy
- PostgreSQL
- Alembic (migrations)
- JWT authentication

### Frontend
- React + TypeScript
- Redux Toolkit
- React Router
- Vite
- Axios

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Activate the virtual environment:
```bash
source venv/bin/activate  # On macOS/Linux
# or
venv\Scripts\activate  # On Windows
```

3. Install dependencies (if not already installed):
```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the backend directory:
```bash
cp .env.example .env
```

5. Update the `.env` file with your database credentials:
```
DATABASE_URL=postgresql://username:password@localhost/dbname
SECRET_KEY=your-secret-key-here
```

6. Run database migrations:
```bash
alembic upgrade head
```

7. Start the development server:
```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
yarn install
# or
npm install
```

3. Start the development server:
```bash
yarn dev
# or
npm run dev
```

The frontend will be available at `http://localhost:5173`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Projects
- `GET /api/projects/` - Get all projects for current user
- `GET /api/projects/{id}` - Get a specific project
- `POST /api/projects/` - Create a new project
- `PUT /api/projects/{id}` - Update a project
- `DELETE /api/projects/{id}` - Delete a project

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI application
│   ├── database.py      # Database configuration
│   ├── models.py        # SQLAlchemy models
│   ├── schemas.py       # Pydantic schemas
│   ├── auth.py          # Authentication utilities
│   └── routers/         # API routes
│       ├── auth.py
│       └── projects.py
├── alembic/             # Database migrations
└── requirements.txt

frontend/
├── src/
│   ├── api/            # API client functions
│   ├── components/     # React components
│   ├── pages/          # Page components
│   ├── store/          # Redux store and slices
│   ├── hooks/          # Custom hooks
│   └── types/          # TypeScript types
└── package.json
```

## Development

- Backend API documentation: `http://localhost:8000/docs`
- Frontend runs on: `http://localhost:5173`

## Notes

- Make sure PostgreSQL is running before starting the backend
- The frontend proxy is configured to forward `/api` requests to the backend
- JWT tokens are stored in localStorage

