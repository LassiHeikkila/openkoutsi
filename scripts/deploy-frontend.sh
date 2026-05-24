#!/bin/bash

set -e

if [ "${PWD##*/}" != "openkoutsi" ]; then
    echo "this script must run from the repository root!"
    exit 1
fi

if [ -z "$1" ]; then
    echo "must pass deploy target as the first argument!"
    exit 1
fi

TARGET_SERVER=$1
USER=$2

pushd frontend || exit 2

npm install
npm run build

cp -r .next/static .next/standalone/.next/static

if [ -d public ]; then
    cp -r public .next/standalone/public
fi

echo "copying to server..."

ssh "${USER}@${TARGET_SERVER}" "sudo -S systemctl stop openkoutsi-frontend@${USER}.service"

rsync -a --delete .next/standalone/ "${USER}@${TARGET_SERVER}:/home/${USER}/projects/openkoutsi/frontend/.next/standalone/"

ssh "${USER}@${TARGET_SERVER}" "sudo -S systemctl daemon-reload"
ssh "${USER}@${TARGET_SERVER}" "sudo -S systemctl start openkoutsi-frontend@${USER}.service"

echo "done..."
