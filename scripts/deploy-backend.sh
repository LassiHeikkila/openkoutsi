#!/bin/bash

set -e

TARGET=$1
USER=$2

if [ -z "$TARGET" ]; then
    echo "You must pass the server name as the first argument!"
    exit 1
fi

if [ -z "$USER" ]; then
    echo "You must pass the username as the second argument!"
    exit 1
fi

ssh "${TARGET}" "sudo -S systemctl stop openkoutsi-backend@${USER}.service"

ssh "${TARGET}" "cd projects/openkoutsi && git pull"
#ssh "${TARGET}" "cd projects/openkoutsi && ~/.local/bin/uv run alembic -c backend/alembic.ini upgrade head"

ssh "${TARGET}" "sudo -S systemctl daemon-reload"
ssh "${TARGET}" "sudo -S systemctl start openkoutsi-backend@${USER}.service"
