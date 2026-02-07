#!/bin/bash
# Deployment script for JWT secret to Ubuntu VMs
# Usage: ./deploy-jwt-secret.sh

set -e

# Configuration
SECRET_FILE_PATH="/opt/pestcontrol-backend/secrets/jwt.key"
SERVICE_NAME="pestcontrol-api"
DEPLOY_USER="deploy-user"

# VM hosts (update with your actual VM hostnames/IPs)
VM_HOSTS=(
  "vm1.pestcontrol.local"
  "vm2.pestcontrol.local"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== JWT Secret Deployment Script ===${NC}\n"

# Check if JWT secret is provided
if [ -z "$JWT_SECRET" ]; then
  echo -e "${RED}ERROR: JWT_SECRET environment variable not set${NC}"
  echo "Usage: JWT_SECRET='your_secret_here' ./deploy-jwt-secret.sh"
  echo ""
  echo "Generate a new secret with:"
  echo "  node scripts/generate-jwt-secret.js"
  exit 1
fi

echo -e "${YELLOW}This will deploy the JWT secret to ${#VM_HOSTS[@]} VMs${NC}"
echo "VMs: ${VM_HOSTS[@]}"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# Deploy to each VM
for HOST in "${VM_HOSTS[@]}"; do
  echo -e "\n${GREEN}Deploying to $HOST...${NC}"
  
  # Create secrets directory if it doesn't exist
  ssh $DEPLOY_USER@$HOST "sudo mkdir -p $(dirname $SECRET_FILE_PATH) && \
                           sudo chmod 700 $(dirname $SECRET_FILE_PATH)"
  
  # Write secret to file
  echo "$JWT_SECRET" | ssh $DEPLOY_USER@$HOST "sudo tee $SECRET_FILE_PATH > /dev/null"
  
  # Set proper permissions
  ssh $DEPLOY_USER@$HOST "sudo chmod 400 $SECRET_FILE_PATH && \
                           sudo chown $SERVICE_NAME:$SERVICE_NAME $SECRET_FILE_PATH"
  
  # Verify file was created
  if ssh $DEPLOY_USER@$HOST "sudo test -f $SECRET_FILE_PATH"; then
    echo -e "${GREEN}✓ Secret deployed to $HOST${NC}"
  else
    echo -e "${RED}✗ Failed to deploy secret to $HOST${NC}"
    exit 1
  fi
done

echo -e "\n${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Update backend/.env or systemd service to set:"
echo "   JWT_SECRET_FILE=$SECRET_FILE_PATH"
echo "2. Restart services on all VMs:"
echo "   sudo systemctl restart $SERVICE_NAME"
echo ""
