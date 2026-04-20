#!/bin/bash

if [ "${PWD##*/}" != "openkoutsi" ]; then
    echo "this script must run from the repository root!"
    exit 1
fi

if [ -z "$1" ]; then
    echo "must pass deploy target as the first argument!"
    exit 1
fi

TARGET=$1

pushd frontend || exit 2

npm install
npm run build

cp -r .next/static .next/standalone/.next/static

if [ -d public ]; then
    cp -r public .next/standalone/public
fi

echo "copying to server..."

rsync -a --delete .next/standalone/ "${TARGET}/.next/standalone/"

echo "done..."
