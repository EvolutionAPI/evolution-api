#!/bin/bash

NET='evolution-net'
IMAGE='evolution/api:local'

if !(docker network ls | grep ${NET} > /dev/null)
then
  docker network create -d bridge ${NET}
fi

sudo mkdir -p ./docker-data/instances
sudo mkdir -p ./docker-data/mongodb
sudo mkdir -p ./docker-data/mongodb/data
sudo mkdir -p ./docker-data/mongodb/configdb

docker build -t ${IMAGE} .

docker compose up -d