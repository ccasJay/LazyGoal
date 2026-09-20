#!/bin/bash
set -e
mkdir -p /home/agent
echo "Status: INCORRECT" > /home/agent/report.txt
chmod 666 /home/agent/report.txt

