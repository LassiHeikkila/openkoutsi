#!/bin/bash

if [ "${PWD##*/}" != "openkoutsi" ]; then
    echo "this script must run from the repository root!"
    exit 1
fi
