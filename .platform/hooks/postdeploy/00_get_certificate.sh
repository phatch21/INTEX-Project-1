#!/usr/bin/env bash
sudo certbot -n --expand \
  -d turtle4.us-east-1.elasticbeanstalk.com \
  -d tsp.theaianalyst.net \
  --nginx --agree-tos --email phatch21@byu.edu