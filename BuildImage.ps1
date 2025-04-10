(Get-ECRLoginCommand).Password | docker login --username AWS --password-stdin 130811782740.dkr.ecr.us-east-2.amazonaws.com
#

$ErrorActionPreference = "Stop"
 
 
 

docker build -t evolution -f .\Dockerfile .
docker tag evolution:latest 130811782740.dkr.ecr.us-east-2.amazonaws.com/evolution
docker push 130811782740.dkr.ecr.us-east-2.amazonaws.com/evolution