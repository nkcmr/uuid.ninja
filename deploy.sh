#!/bin/bash
set -eoux pipefail

gcpprojectid="$1"

# build the image
gcloud builds submit --tag "gcr.io/$gcpprojectid/main"

# deploy it
gcloud run deploy --image "gcr.io/$gcpprojectid/main" --platform managed
