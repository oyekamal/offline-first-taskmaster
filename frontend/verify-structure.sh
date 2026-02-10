#!/bin/bash

echo "=========================================="
echo "Frontend Project Structure Verification"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        return 0
    else
        echo -e "${RED}✗${NC} $1"
        return 1
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
        return 0
    else
        echo -e "${RED}✗${NC} $1/"
        return 1
    fi
}

echo "Checking directory structure..."
echo ""

# Root files
check_file "package.json"
check_file "tsconfig.json"
check_file "vite.config.ts"
check_file "tailwind.config.js"
check_file "postcss.config.js"
check_file "index.html"
check_file "README.md"
check_file "SETUP.md"
check_file ".env.example"
echo ""

# Source directories
check_dir "src"
check_dir "src/components"
check_dir "src/db"
check_dir "src/db/repositories"
check_dir "src/hooks"
check_dir "src/services"
check_dir "src/types"
check_dir "src/utils"
echo ""

# Public directory
check_dir "public"
check_file "public/sw.js"
check_file "public/manifest.json"
echo ""

# Core source files
echo "Checking core source files..."
check_file "src/main.tsx"
check_file "src/App.tsx"
check_file "src/index.css"
check_file "src/types/index.ts"
check_file "src/db/index.ts"
echo ""

# Repositories
echo "Checking repositories..."
check_file "src/db/repositories/TaskRepository.ts"
check_file "src/db/repositories/CommentRepository.ts"
echo ""

# Services
echo "Checking services..."
check_file "src/services/apiClient.ts"
check_file "src/services/syncManager.ts"
echo ""

# Hooks
echo "Checking hooks..."
check_file "src/hooks/index.ts"
check_file "src/hooks/useTasks.ts"
check_file "src/hooks/useComments.ts"
check_file "src/hooks/useSync.ts"
check_file "src/hooks/useOnlineStatus.ts"
echo ""

# Components
echo "Checking components..."
check_file "src/components/TaskCard.tsx"
check_file "src/components/TaskForm.tsx"
check_file "src/components/TaskDetail.tsx"
check_file "src/components/TaskListVirtualized.tsx"
check_file "src/components/TaskListDraggable.tsx"
check_file "src/components/TaskFilters.tsx"
check_file "src/components/CommentSection.tsx"
check_file "src/components/SyncStatusIndicator.tsx"
check_file "src/components/OfflineIndicator.tsx"
check_file "src/components/ConflictResolver.tsx"
echo ""

# Utils
echo "Checking utilities..."
check_file "src/utils/dateFormat.ts"
check_file "src/utils/fractionalIndexing.ts"
echo ""

echo "=========================================="
echo "Verification Complete!"
echo "=========================================="
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Run: npm install"
echo "2. Run: npm run dev"
echo "3. Open: http://localhost:3000"
echo ""
