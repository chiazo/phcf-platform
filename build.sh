#!/bin/bash
set -e

cd www
npm run build
cd ..
rm -rf server/dist
cp -r www/dist server/dist
cd server
go build -o app export.go main.go
cd ..