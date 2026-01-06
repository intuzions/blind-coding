# AiApps

Generated application from No-Code Platform.

## Project ID: 1

## Getting Started

### Prerequisites
- Node.js 16+ (for manual setup)
- Python 3.9+ (for manual setup)
- Docker and Docker Compose (recommended)

### Running with Docker (Recommended)

```bash
# Build and start all services
docker-compose up --build

# Or run in detached mode
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Running Manually

#### Frontend
```bash
cd frontend
npm install
npm start
```

#### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

## Access

- Frontend: http://localhost:3001
- Backend API: http://localhost:8001
- API Docs: http://localhost:8001/docs

## Project Structure

```
AiApps/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── styles/        # CSS files
│   │   │   ├── global.css # Global styles
│   │   │   └── *.css      # Page-specific styles
│   │   ├── App.js
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
└── docker-compose.yml
```

## Notes

- All styles are in separate CSS files (no inline styles)
- Each page has its own CSS file in `src/styles/`
- Components use CSS classes for styling
- Custom CSS from components is properly scoped
