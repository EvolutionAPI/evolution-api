(Get-ECRLoginCommand).Password | docker login --username AWS --password-stdin 130811782740.dkr.ecr.us-east-2.amazonaws.com
#
# Build da imagem com a tag correta
docker build -t evolution:2.1.2.debug -f ./Dockerfile .

# Tag para o ECR
docker tag evolution:2.1.2.debug 130811782740.dkr.ecr.us-east-2.amazonaws.com/evolution

# Push para o ECR (após login)
docker push 130811782740.dkr.ecr.us-east-2.amazonaws.com/evolution
