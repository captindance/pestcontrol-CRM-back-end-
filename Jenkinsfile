pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20', daysToKeepStr: '14'))
    timestamps()
  }

  parameters {
    string(name: 'BRANCH', defaultValue: 'main', description: 'Backend branch to deploy')
    string(name: 'SSH_CRED_ID', defaultValue: 'recipes-backend', description: 'Jenkins SSH credential ID for server deploy')

    string(name: 'BACKEND_SERVER', defaultValue: 'captindance@192.168.4.49', description: 'SSH user@host for backend server')
    string(name: 'BACKEND_PATH', defaultValue: '/home/captindance/pestcontrol-backend', description: 'Backend deploy path on server')
    string(name: 'BACKEND_PM2_NAME', defaultValue: 'pestcontrol-backend', description: 'PM2 process name for backend')
    string(name: 'BACKEND_HEALTH_URL', defaultValue: 'http://127.0.0.1:3000/api/health', description: 'Health check URL on backend server')

    booleanParam(name: 'DEPLOY_FRONTEND', defaultValue: true, description: 'Deploy frontend in the same run')
    string(name: 'FRONTEND_REPO', defaultValue: 'https://github.com/captindance/pestcontrol-CRM-front-end.git', description: 'Frontend repository URL')
    string(name: 'FRONTEND_BRANCH', defaultValue: 'main', description: 'Frontend branch to deploy')
    string(name: 'FRONTEND_GIT_CRED_ID', defaultValue: 'Jenkins-pipline', description: 'Jenkins credential ID for frontend repo checkout')
    string(name: 'FRONTEND_SERVER', defaultValue: 'captindance@192.168.4.50', description: 'SSH user@host for frontend server')
    string(name: 'FRONTEND_PATH', defaultValue: '/home/captindance/pestcontrol-frontend', description: 'Frontend deploy path on server')
    string(name: 'FRONTEND_PM2_NAME', defaultValue: 'pestcontrol-frontend', description: 'PM2 process name for frontend')
    string(name: 'FRONTEND_PORT', defaultValue: '3000', description: 'Port for frontend process')
  }

  stages {
    stage('Checkout Backend') {
      steps {
        checkout scm
        sh '''
          set -e
          git fetch --all --prune
          git checkout "$BRANCH"
          git reset --hard "origin/$BRANCH"
        '''
      }
    }

    stage('Checkout Frontend') {
      when { expression { return params.DEPLOY_FRONTEND } }
      steps {
        dir('frontend-src') {
          deleteDir()
          checkout([
            $class: 'GitSCM',
            branches: [[name: "*/${params.FRONTEND_BRANCH}"]],
            userRemoteConfigs: [[url: "${params.FRONTEND_REPO}", credentialsId: params.FRONTEND_GIT_CRED_ID]]
          ])
        }
      }
    }

    stage('Deploy Backend') {
      steps {
        sshagent(credentials: [params.SSH_CRED_ID]) {
          sh '''
            set -e
            SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

            ssh $SSH_OPTS "$BACKEND_SERVER" "mkdir -p '$BACKEND_PATH'"

            rsync -az --delete -e "ssh $SSH_OPTS" \
              --exclude '.git' \
              --exclude 'node_modules' \
              --exclude '.env' \
              --exclude '.env.*' \
              ./ "$BACKEND_SERVER:$BACKEND_PATH/"

            ssh $SSH_OPTS "$BACKEND_SERVER" "
              set -e
              cd '$BACKEND_PATH'
              npm ci || npm install
              npm run build
              npx --yes prisma migrate deploy
              pm2 restart '$BACKEND_PM2_NAME' || pm2 start dist/server.js --name '$BACKEND_PM2_NAME'
              pm2 save || true
              pm2 startup || true
              curl -fsS '$BACKEND_HEALTH_URL'
            "
          '''
        }
      }
    }

    stage('Deploy Frontend') {
      when { expression { return params.DEPLOY_FRONTEND } }
      steps {
        sshagent(credentials: [params.SSH_CRED_ID]) {
          sh '''
            set -e
            SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

            ssh $SSH_OPTS "$FRONTEND_SERVER" "mkdir -p '$FRONTEND_PATH'"

            rsync -az --delete -e "ssh $SSH_OPTS" \
              --exclude '.git' \
              --exclude 'node_modules' \
              --exclude '.env' \
              --exclude '.env.*' \
              frontend-src/ "$FRONTEND_SERVER:$FRONTEND_PATH/"

            ssh $SSH_OPTS "$FRONTEND_SERVER" "
              set -e
              cd '$FRONTEND_PATH'
              npm ci || npm install
              npm run build
              pm2 restart '$FRONTEND_PM2_NAME' || pm2 start npm --name '$FRONTEND_PM2_NAME' -- run preview -- --host 0.0.0.0 --port '$FRONTEND_PORT'
              pm2 save || true
              pm2 startup || true
              curl -fsS 'http://127.0.0.1:$FRONTEND_PORT/' >/dev/null
            "
          '''
        }
      }
    }
  }

  post {
    success { echo 'Deploy succeeded.' }
    failure { echo 'Deploy failed. Check stage logs above.' }
  }
}
