# Overview

This is an overview of how to run this single page application, backed by pocketbase.

# Local Execution Instructions
## Complete local installs in root directory
Update NodeJS to a more recent version, requires >Node18: ```nvm use 24.5.0 ```

Install Vite: ```npm i vite```

Delete node_modules and package-lock, then reinstall a fresh version: ```npm i```


## Node installs in /www directory
Navigate to /www: ```cd www```

Check if node_modules exists within the /www/ directory. If so, delete before reinstalling.
```
npm i
cd ..
```
## Setting up PocketBase and Go
```
cd server
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
http://localhost:8090/_/#/collections?collection=member_snapshot



# Development Instructions for creating new collections and uploading data
Start up the local dev environment using the instructions above. From the PB UI, select "+ New Collection". Add the new collection name ("COLLECTION_NAME_ON_PB") and well as the parameters of the collection, be careful to use exact spelling.

Create JSON data from sample data or CSV conversion from google input. Store that JSON data in scripts/fixtures/FILENAME.json.

```
cd scripts
node pb-import.mjs fixtures/FILENAME.json --collection COLLECTION_NAME_ON_PB
```


## Adding User Data
The default collection is member_snapshot. If adding to member_snapshot, the collection name doesn't need to be specified.

### Dry Run to Test User Data Upload Pipeline
Before testing the member_snapshot data upload, the application must already be running at: http://127.0.0.1:8090.

```
cd scripts
node pb-import.mjs fixtures/member_snapshot_import.json --dry-run
```

Test adding data to collections using the demo json data. Test should return a similar structure to the following, where the number of new users added is NUM_USERS:

```
Importing (batch size NUM_USERS)...

[1/NUM_USERS] would CREATE (USER1EXAMPLE@email.com)
[2/NUM_USERS] would CREATE (USER2EXAMPLE@email.com)
...

Summary:
  would-create: NUM_USERS
```

### Connect to Pocketbase with Auth to Upload New User Data
Upload user information from files in the fixtures/ directory after signing in with superuser auth. The following command load sample data from fixtures/member_snapshot_import.json into the member_snapshot collection on Pocketbase.

```
cd scripts
node pb-import.mjs fixtures/member_snapshot_import.json
```

You can view added member snapshots in the member_snapshot collection on PB: http://localhost:8090/_/#/collections?collection=member_snapshot


## Box Info Upload and Testing
### Dry Run Test case for box info upload from JSON
```
cd scripts
node pb-import.mjs fixtures/box_info_import.json --collection boxes --dry-run
```

### Box info upload from JSON
```
cd scripts
node pb-import.mjs fixtures/box_info_import.json --collection boxes
```

You can view added boxes in the boxes collection on PB: http://localhost:8090/_/#/collections?collection=boxes




## Deploy 
switch .env `BACKEND_PROVIDER` between `fly` and `gcp` depending on desired provider
```
./deploy.sh all                     # deploy backend + frontend using BACKEND_PROVIDER from .env
./deploy.sh all gcp                 # force GCP for this run only
./deploy.sh all fly                 # force Fly for this run only
./deploy.sh backend gcp             # just redeploy the GCP backend
./deploy.sh frontend                # redeploy frontend, pointed at whatever backend is active
./deploy.sh superuser _ fly         # create superuser on Fly (positional quirk — see note below)
./deploy.sh                          # auto mode, current BACKEND_PROVIDER
```

## Wipe GCP 
`./gcp-manage.sh reset`