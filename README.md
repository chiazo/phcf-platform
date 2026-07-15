# Overview

This is an overview of how to run this single page application, backed by pocketbase.

## Run Locally

Complete local installs
Node>22: ```nvm use 24.5.0 ```
Install Vite
delete node_modules and package-lock
```
npm i
cd www
```
Check if node_modules exists within the /www/ directory. If so, delete before reinstalling.
```
npm i
cd ..
```

on first run: ```./build.sh```
for dev: ```./run.sh```





## Other installs
```npm i vite```



## Deploy

- Frontend: `./deploy.sh frontend`
- Backend: `./deploy.sh backend`