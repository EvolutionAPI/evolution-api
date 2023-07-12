#!/bin/bash

NET='evolution-net'
IMAGE='evolution/api:local'

if !(docker network ls | grep ${NET} > /dev/null)
then
  docker network create -d bridge ${NET}
fi

docker build -t ${IMAGE} .

docker compose up -d