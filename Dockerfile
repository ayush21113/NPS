# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV PORT 8080

# Set work directory
WORKDIR /app

# Install dependencies
COPY backend/requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend and frontend
COPY backend /app/backend
COPY frontend /app/frontend

# Create log directory
RUN mkdir -p /app/backend/logs

# Final working directory for running the app
WORKDIR /app/backend

# Expose the port FastAPI runs on
EXPOSE 8080

# Command to run the application
# We use 0.0.0.0 to allow external access (essential for Docker/Cloud)
CMD ["python", "run.py", "--host", "0.0.0.0", "--port", "8080"]
