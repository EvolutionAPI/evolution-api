#!/bin/bash
IMAGE='evolution/api:local'

docker build -t ${IMAGE} .

docker compose up -d
