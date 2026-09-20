#!/bin/bash
mkdir -p /logs/verifier
if grep -q "Status: CORRECT" /home/agent/report.txt 2>/dev/null && ! grep -q "INCORRECT" /home/agent/report.txt 2>/dev/null; then
    echo "1.0" > /logs/verifier/reward.txt
    echo "All verification checks passed!"
    exit 0
else
    echo "0.0" > /logs/verifier/reward.txt
    echo "Verification failed: report.txt did not contain expected content."
    exit 1
fi

