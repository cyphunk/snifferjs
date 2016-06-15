#!/usr/bin/env bash

echo "Generating unencrypted mail requests using arguments"
echo "arg1 = mail server: \"$1\""
echo "arg2 = email address: \"$2\""
read -p "continue?"

echo "# POP"
CR=$'\r'
# src https://gist.github.com/xionluhnis/4712075
exec 3<>/dev/tcp/$1/110
read ok line <&3
[ "${ok%$CR}" != "+OK" ] && exit 5
echo "got ok for connect"
echo user "$2" >&3
read ok line <&3
[ "${ok%$CR}" != "+OK" ] && exit 5
echo "got ok for user. exit"
