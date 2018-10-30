#!/bin/bash

set -e

echo Start
# This should run on branches named "production-X" where "X" is the name of a 
# service package of ours recognized by Lerna.
[[ $CODEBUILD_INITIATOR =~ ^codepipeline/(production|staging)\.([^/@]+) ]] || exit -1

export SERVICE_NAME="${BASH_REMATCH[2]}"

echo "DEPLOY" $SERVICE_NAME

# npx lerna run --stream --scope $SERVICE_NAME codepipeline-deploy
