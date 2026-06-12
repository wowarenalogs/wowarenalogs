# One-time provisioning for the partner webhook topic. Run once per GCP project,
# before the first deploy. Idempotent — safe to re-run.
#
# Usage: .\setup_webhook_pubsub.ps1 <project-id>

param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId
)

# Don't let $ErrorActionPreference auto-fail on native commands — we check
# $LASTEXITCODE explicitly so the describe-or-create pattern works correctly.
$ErrorActionPreference = "Continue"
$WebhookTopic = "partner-webhook-event"

$projectNumber = gcloud projects describe $ProjectId --format='value(projectNumber)'
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to describe project '$ProjectId'. Check the id and that you're authenticated (gcloud auth login)."
    exit 1
}
$computeSA = "$projectNumber-compute@developer.gserviceaccount.com"

Write-Host "Provisioning webhook topic in $ProjectId..." -ForegroundColor Yellow

gcloud pubsub topics describe $WebhookTopic --project=$ProjectId 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    gcloud pubsub topics create $WebhookTopic --project=$ProjectId
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to create topic $WebhookTopic."; exit 1 }
}

# writeMatchStub runs as the compute SA and needs to publish to the topic.
gcloud pubsub topics add-iam-policy-binding $WebhookTopic `
    --member="serviceAccount:$computeSA" `
    --role="roles/pubsub.publisher" `
    --project=$ProjectId
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to bind pubsub.publisher to $computeSA."; exit 1 }

Write-Host "Webhook topic provisioning complete." -ForegroundColor Green
