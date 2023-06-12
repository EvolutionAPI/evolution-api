#!/bin/bash

NET='evolution-net'
IMAGE='evolution/api:local'

if !(docker network ls | grep ${NET} > /dev/null)
then
  docker network create -d bridge ${NET}
fi

sudo mkdir -p /data/instances

docker build -t ${IMAGE} .

docker run -d --restart 'always' --name 'evolution_api' --mount 'type=bind,source=/data/instances,target=/evolution/instances' --publish '8083:8083' --hostname 'evolution' --network ${NET} ${IMAGE}