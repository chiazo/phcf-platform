# Overview

This is an overview of how to run this single page application, backed by pocketbase.

# Local Execution Instructions
## Complete local installs in root directory
Update NodeJS to a more recent version: ```nvm use 24.5.0 ```

Install Vite: ```npm i vite```

Delete node_modules and package-lock, then reinstall a fresh version:```npm i```


## Node installs in /www directory
Navigate to /www: ```cd www```

Check if node_modules exists within the /www/ directory. If so, delete before reinstalling.
```
npm i
cd ..
```
## Setting up PocketBase and Go
NEW:
```
cd server
go mod tidy
go run main.go serve
````


OLD, !! hold onto until confirmed pocketbase pull isn't needed:
```
cd server
go mod init app
go get github.com/pocketbase/pocketbase
go mod tidy
cd ..
```
## Run App
On the first run, navigate to the root directory and run build.

 ```./build.sh```

For all subsequent development, you can start the app with: 

```./run.sh```

## View App
Navigate to the view on local at the link:
http://localhost:8090/_/#/collections?collection=member
