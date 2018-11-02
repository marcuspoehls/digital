#!/bin/bash

heads=`git ls-remote --heads origin "production/*"`

# This iterates over every lerna package that’s in a "services" directory.
npx lerna ls -a -p | grep "/services-.*/" | while read dir; do
  service=`basename $dir`
  branch=production/$service

  echo Checking ${service}…

  # Tests to see if the remote has a production branch for this service.
  commit=`echo "$heads" | grep -F refs/heads/$branch | cut -f1`

  if [ -z $commit ]; then
    echo "No production branch found"
    continue
  fi

  echo $commit
  # Tests to see if the service appears in the list of packages changed since
  # the service’s last production branch.
  npx lerna ls -a -p --since $commit | awk -F/ '{print $NF}' | grep -qF $service

  if [ $? -eq 0 ]; then
    # TODO(finh): Change to webhook to the bot and have it move the branch.
    echo "git push origin HEAD:$branch"
  fi
done
