# Overview

This is an overview of how to run this single page application, backed by pocketbase.

## Local Execution Instructions
### Complete local installs in root directory
Node>22: ```nvm use 24.5.0 ```
Install Vite
delete node_modules and package-lock
```
npm i
```
### Node installs in /www directory
```
cd www
```
Check if node_modules exists within the /www/ directory. If so, delete before reinstalling.
```
npm i
cd ..
```
### Setting up PocketBase and Go
```
cd server
go mod init app
go get github.com/pocketbase/pocketbase
go mod tidy
cd ..
```
### Run App
On the first run, first run build in the root directory.

 ```./build.sh```

For all subsequent development, you can start the app with: 

```./run.sh```

### View App
Navigate to the view on local at the link:
http://127.0.0.1:8090/_/#/collections?collection=users 












## Deploy

- Frontend: `./deploy.sh frontend`
- Backend: `./deploy.sh backend`