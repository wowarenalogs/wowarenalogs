DONT_RUN_THIS

# Clear temp
gsutil -m rm gs://wowarenalogs-anon-log-files-dev/*

# Transfer TO temp
gsutil -m cp -r gs://wowarenalogs-log-files-dev/* gs://wowarenalogs-log-files-temp

# Transfer FROM temp
gsutil -m cp -r gs://wowarenalogs-log-files-temp/* gs://wowarenalogs-log-files-dev
