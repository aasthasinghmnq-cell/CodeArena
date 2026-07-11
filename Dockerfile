# Use Node.js 18 as the base image
FROM node:18-bullseye-slim

# Install Python, G++ (for C++), and OpenJDK (for Java)
RUN apt-get update && apt-get install -y \
    python3 \
    g++ \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Create the temp directory for code execution
RUN mkdir -p temp && chmod 777 temp

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Command to run the application
CMD ["node", "server.js"]
