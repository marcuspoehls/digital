/* eslint no-console: 0 */

import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

import AWS from 'aws-sdk';
import shell, { ExecOutputReturnValue } from 'shelljs';
import tar from 'tar';
import { IncomingWebhook } from '@slack/client';
import ignore from 'ignore';

import mime from 'mime-types';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const lstat = promisify(fs.lstat);
const realpath = promisify(fs.realpath);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);

export const AWS_REGION = 'us-east-1';
AWS.config.update({ region: AWS_REGION });

export const STAGING_CLUSTER = 'AppsStaging';
export const PROD_CLUSTER = 'AppsProd';

export const BANNER = `
┌───────────────────────────┐
│ 🎀 Yo it’s Shippy-Toe! 🎀 │
└───────────────────────────┘
`;

function getRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export async function getAccountId(): Promise<string> {
  const sts = new AWS.STS();
  return (await sts.getCallerIdentity().promise()).Account!;
}

export async function dockerAwsLogin() {
  const ecr = new AWS.ECR();
  const response = await ecr.getAuthorizationToken().promise();

  if (response.authorizationData) {
    response.authorizationData.forEach(
      ({ authorizationToken, proxyEndpoint }) => {
        const [username, password] = new Buffer(authorizationToken!, 'base64')
          .toString()
          .split(':');

        const command = `docker login -u ${username} -p ${password} ${proxyEndpoint}`;

        if (
          (shell.exec(command, { silent: true }) as ExecOutputReturnValue)
            .code !== 0
        ) {
          throw new Error(`Unable to run docker login for ${proxyEndpoint}`);
        }
      }
    );
  }
}

/**
 * Makes a tar of just the package.json files in the repo. This will let us do a
 * yarn install based on those, which will then be mostly cached across builds
 * (since package.jsons don’t change very often).
 *
 * Doing this with a tar is because Docker doesn’t have a native way to COPY in
 * a filtered subtree of files. (Glob patterns cause all the files end up in the
 * destination directory, not their subdirectories.)
 */
export async function makePackageJsonTar(workspaceDir) {
  const packages = (shell.exec(
    `find ../.. -name 'package.json' -not -path "*/node_modules/*"`,
    {
      silent: true,
    }
  ).stdout as string).split('\n');
  packages.pop();

  await tar.create(
    {
      file: path.join(workspaceDir, 'package-json.tar'),
      cwd: workspaceDir,
      // We keep metadata out so that tarring across Travis deploys makes the
      // same file, so that Docker caches things.
      portable: true,
      noMtime: true,
    },
    packages.map(p => p.replace('../../', ''))
  );
}

/**
 * @param image Repository or image name
 * @returns True if successful
 */
export async function pullImage(image: string, tag: string): Promise<boolean> {
  const command = `docker pull ${image}:${tag}`;

  return shell.exec(command).code === 0;
}

export async function buildImage(
  dir,
  dockerfilePath: string,
  cacheFromImage: string | null,
  tags: string[] = []
) {
  const command = `docker build \
    --pull \
    -f ${dockerfilePath} \
    ${cacheFromImage ? `--cache-from ${cacheFromImage}` : ''} \
    ${tags.map(t => `-t ${t}`).join(' ')} \
    ${dir}`;

  if (shell.exec(command).code !== 0) {
    throw new Error('Error building container');
  }
}

export async function pushImage(image: string) {
  if (shell.exec(`docker push ${image}`).code !== 0) {
    throw new Error('Error pushing container');
  }
}

export async function runScopedLernaScript(scope: string, script: string) {
  const command = `npx lerna run --stream --scope ${scope} --include-filtered-dependencies ${script}`;
  if (shell.exec(command).code !== 0) {
    throw new Error(`Error running lerna script: ${script}`);
  }
}

export async function runNpmScript(script: string) {
  if (shell.exec(`npm run ${script}`).code !== 0) {
    throw new Error(`Error running npm script: ${script}`);
  }
}

export async function getRepository(
  environment: string,
  serviceName: string
): Promise<string> {
  const registry =
    environment === 'production'
      ? 'cob-digital-apps-prod'
      : 'cob-digital-apps-staging';
  const accountId = await getAccountId();
  return `${accountId}.dkr.ecr.${AWS_REGION}.amazonaws.com/${registry}/${serviceName}`;
}

export async function updateStagingService(serviceName: string) {
  const ecs = new AWS.ECS();

  const updatedService = (await ecs
    .updateService({
      cluster: STAGING_CLUSTER,
      service: serviceName,
      forceNewDeployment: true,
      desiredCount: 1,
    })
    .promise()).service!;

  const latestDeployment = (updatedService.deployments || [])[0];
  if (!latestDeployment) {
    throw new Error('Could not find the new deployment');
  }

  return {
    service: updatedService,
    deploymentId: latestDeployment.id!,
  };
}

export async function updateEcsService(
  environment: string,
  ecsServiceName: string,
  image: string
) {
  const ecs = new AWS.ECS();
  const ecsCluster = environment === 'staging' ? STAGING_CLUSTER : PROD_CLUSTER;

  const latestTaskDefinition = (await ecs
    .describeTaskDefinition({
      taskDefinition: `${ecsCluster}-${ecsServiceName}`,
    })
    .promise()).taskDefinition!;

  const containerDefinitions: AWS.ECS.ContainerDefinition[] = (
    latestTaskDefinition.containerDefinitions || []
  ).map(c => ({
    ...c,
    // We iterate through the containers in the task definition and update any
    // that share the same repository. This is tolerant of task definitions that
    // reference e.g. "mysql" containers.
    image: c.image!.startsWith(image.split(':')[0]) ? image : c.image,
  }));

  const newTaskDefinition = (await ecs
    .registerTaskDefinition({
      family: latestTaskDefinition.family!,
      taskRoleArn: latestTaskDefinition.taskRoleArn,
      executionRoleArn: latestTaskDefinition.executionRoleArn,
      networkMode: latestTaskDefinition.networkMode,
      containerDefinitions,
      volumes: latestTaskDefinition.volumes,
      placementConstraints: latestTaskDefinition.placementConstraints,
      requiresCompatibilities: latestTaskDefinition.requiresCompatibilities,
      cpu: latestTaskDefinition.cpu,
      memory: latestTaskDefinition.memory,
    })
    .promise()).taskDefinition!;

  const { service, deploymentId } = await updateServiceTaskDefinition(
    environment,
    ecsServiceName,
    newTaskDefinition.taskDefinitionArn!
  );

  // We try to find a deployment that’s running on the service, since the most
  // recent task definition might not actually be viable.
  const previousDeployment = (service.deployments || [])
    .filter(d => d.status === 'ACTIVE')
    .pop();

  const oldTaskDefinitionArn = previousDeployment
    ? previousDeployment.taskDefinition!
    : latestTaskDefinition.taskDefinitionArn!;

  return {
    service,
    deploymentId,
    newTaskDefinitionArn: newTaskDefinition.taskDefinitionArn!,
    oldTaskDefinitionArn,
  };
}

export async function updateServiceTaskDefinition(
  environment: string,
  ecsServiceName: string,
  taskDefinitionArn: string
) {
  const ecs = new AWS.ECS();

  const updatedService = (await ecs
    .updateService({
      cluster: environment === 'production' ? PROD_CLUSTER : STAGING_CLUSTER,
      service: ecsServiceName,
      taskDefinition: taskDefinitionArn,
    })
    .promise()).service!;

  const latestDeployment = (updatedService.deployments || [])[0];
  if (!latestDeployment) {
    throw new Error('Could not find the new deployment');
  }

  return { service: updatedService, deploymentId: latestDeployment.id! };
}

export async function deregisterTaskDefinition(taskDefinitionArn: string) {
  const ecs = new AWS.ECS();
  await ecs
    .deregisterTaskDefinition({
      taskDefinition: taskDefinitionArn,
    })
    .promise();
}

export function parseBranch(branch: string) {
  const branchMatch = branch.match(/([^/]*)\/([^@]*)(@(.*))?/);

  if (!branchMatch) {
    throw new Error(
      `Branch ${branch} did not match environment/service@variant pattern`
    );
  }
  const environment = branchMatch[1];
  const serviceName = branchMatch[2];
  const variant = branchMatch[4] || '';

  return { environment, serviceName, variant };
}

export async function waitForDeployment(
  service: AWS.ECS.Service,
  deploymentId: string,
  eventCb?: (e: AWS.ECS.ServiceEvent) => any
) {
  const ecs = new AWS.ECS();

  const startTimeMs = new Date().getTime();

  let deployed = false;
  let lastEventId = ((service.events || [])[0] || {}).id;
  let lastEventTimeMs = startTimeMs;

  while (!deployed) {
    const updatedService = (await ecs
      .describeServices({
        cluster: service.clusterArn!,
        services: [service.serviceName!],
      })
      .promise()).services![0];

    // We check and see if this deployment has any stopped tasks, which means
    // that they failed for some reason. If this happens, abort the deploy as a
    // failure.
    const stoppedTaskArns =
      (await ecs
        .listTasks({
          cluster: service.clusterArn!,
          startedBy: deploymentId,
          desiredStatus: 'STOPPED',
        })
        .promise()).taskArns || [];

    if (stoppedTaskArns.length) {
      const stoppedTasks = (await ecs
        .describeTasks({
          cluster: service.clusterArn!,
          tasks: stoppedTaskArns,
        })
        .promise()).tasks!;

      const firstStoppedTask = stoppedTasks[0];
      throw new Error(
        `Deployment task ${firstStoppedTask.taskArn} failed: ${
          firstStoppedTask.stoppedReason
        }`
      );
    }

    const updatedDeployment = (updatedService.deployments || []).find(
      ({ id }) => id === deploymentId
    );

    if (!updatedDeployment) {
      // We have a 10 second grace time for the deployment to show up in the
      // API. It’s not always available right away.
      if (new Date().getTime() - startTimeMs < 10 * 1000) {
        await sleep(2000);
        continue;
      } else {
        throw new Error(
          `Could not find deployment ${deploymentId} in the service`
        );
      }
    }

    const latestEvents: AWS.ECS.ServiceEvent[] = [];
    (updatedService.events || []).some(e => {
      if (e.id === lastEventId) {
        return true;
      } else {
        latestEvents.push(e);
        return false;
      }
    });

    if (latestEvents.length) {
      lastEventId = latestEvents[0].id;
      lastEventTimeMs = new Date().getTime();
    } else if (new Date().getTime() > lastEventTimeMs + 1000 * 60) {
      // We send "still waiting…" messages every minute since the last message
      // to keep Travis running our build.
      latestEvents.push({
        createdAt: new Date(),
        message: 'Still waiting…',
      });

      lastEventTimeMs = new Date().getTime();
    }

    latestEvents.reverse();

    if (eventCb) {
      latestEvents.forEach(eventCb);
    }

    if (updatedDeployment.status !== 'PRIMARY') {
      throw new Error(
        `Deployment failed with status ${updatedDeployment.status}`
      );
    } else if (
      // This heuristic for whether the deployment is done ("are there other
      // deployments around?") fails for the very first deployment to a service.
      (updatedService.deployments || []).filter(
        ({ status }) => status === 'ACTIVE'
      ).length === 0
    ) {
      deployed = true;
    } else {
      await sleep(3000);
    }
  }
}

export async function postTravisToSlack(
  scriptPath: string,
  stage: 'start' | 'error' | 'complete' | 's3-complete',
  error?: string
) {
  try {
    const branch = process.env.TRAVIS_BRANCH;
    const webhookUrl = process.env.SLACK_DEPLOY_WEBHOOK_URL;

    if (!branch) {
      console.warn('No $TRAVIS_BRANCH defined');
    }

    if (!webhookUrl) {
      console.warn('No $SLACK_DEPLOY_WEBHOOK_URL defined');
      return;
    }

    const { environment, serviceName, variant } = parseBranch(
      process.env.TRAVIS_BRANCH!
    );

    const travisNum = `#${process.env.TRAVIS_BUILD_NUMBER}`;
    const travisUrl = `https://travis-ci.org/${
      process.env.TRAVIS_REPO_SLUG
    }/builds/${process.env.TRAVIS_BUILD_ID}`;
    const footer = path.basename(scriptPath);
    const footerIcon = 'https://twemoji.maxcdn.com/2/72x72/1f380.png';

    const webhook = new IncomingWebhook(webhookUrl);

    const githubUrl = `https://github.com/${
      process.env.TRAVIS_REPO_SLUG
    }/tree/${process.env.TRAVIS_BRANCH}`;

    let color;
    let title;
    let text = '';

    const START_EMOJI = [
      '🤖',
      '🕊',
      '🍵',
      '🏹',
      '🚀',
      '📡',
      '⏳',
      '🆕',
      '🔜',
      '🎁',
    ];
    const ERROR_EMOJI = ['😡', '💀', '🙀', '👎🏼', '🙍🏻', '💔', '⚰'];
    const COMPLETE_EMOJI = [
      '👍🏿',
      '💃🏻',
      '💅',
      '🎂',
      '🏅',
      '🎯',
      '🎉',
      '🆒',
      '🔛',
      '💯',
    ];

    const ecsCluster = environment === 'staging' ? 'AppsStaging' : 'AppsProd';

    const ecsService = `${serviceName}${variant ? `-${variant}` : ''}`;
    const ecsUrl = `https://console.aws.amazon.com/ecs/home?region=us-east-1#/clusters/${ecsCluster}/services/${ecsService}/details`;

    const s3Url = `https://${
      environment === 'staging'
        ? 'apps.digital-staging.boston.gov'
        : 'apps.boston.gov'
    }/${serviceName}/`;
    let emoji;

    switch (stage) {
      case 'start':
        color = 'warning';
        title = 'Deploying…';
        text = `Follow along on Travis CI: <${travisUrl}|${travisNum}>`;
        emoji = getRandom(START_EMOJI);
        break;
      case 'complete':
        color = 'good';
        title = 'Success!';
        text = `For more info, check ECS: <${ecsUrl}|${ecsCluster}/${ecsService}>`;
        emoji = getRandom(COMPLETE_EMOJI);
        break;
      case 's3-complete':
        color = 'good';
        title = 'Success!';
        text = `View now: <${s3Url}|${s3Url}>`;
        emoji = getRandom(COMPLETE_EMOJI);
        break;
      case 'error':
        color = 'danger';
        title = 'Errored';
        text = error || '';
        emoji = getRandom(ERROR_EMOJI);
        break;
    }

    await webhook.send({
      attachments: [
        {
          title: `${emoji} <${githubUrl}|${branch}>: ${title}`,
          color,
          text,
          footer,
          footer_icon: footerIcon,
        },
      ],
    });
  } catch (e) {
    console.error('Error sending Slack message: ', e);
  }
}

// https://stackoverflow.com/a/45130990/51835
async function getFiles(dir: string): Promise<Array<string>> {
  const contents = await readdir(dir);

  const files = await Promise.all(
    contents.map(async f => {
      const p = path.resolve(dir, f);
      return (await stat(p)).isDirectory() ? getFiles(p) : p;
    })
  );

  return files.reduce((a: string[], f) => a.concat(f), []);
}

export async function uploadToS3(
  buildDir: string,
  bucket: string,
  keyPrefix: string
) {
  const s3 = new AWS.S3();
  const files = await getFiles(buildDir);

  // This lets us use gitignore-like patterns to keep certain files from being
  // cached. By default we put an hour cache on everything because most of the
  // static files should be versioned.
  const noCache = ignore();
  try {
    const noCacheRules = await readFile('.nocache', 'utf-8');
    noCache.add(noCacheRules);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }

  await Promise.all(
    files.map(async f => {
      const relativeFilePath = path.relative(path.resolve(buildDir), f);
      const key = path.join(keyPrefix, relativeFilePath);

      // We convert symlinks into HTTP redirects on S3, as a way to handle cases
      // where a file may have a hash in it, but we need to link to it from a
      // fixed place.
      const fileStats = await lstat(f);
      if (fileStats.isSymbolicLink()) {
        const location =
          '/' +
          path.join(
            keyPrefix,
            path.relative(path.resolve(buildDir), await realpath(f))
          );

        await s3
          .putObject({
            Bucket: bucket,
            Key: key,
            ACL: 'public-read',
            WebsiteRedirectLocation: location,
          })
          .promise();
      } else {
        const maxAge = noCache.ignores(relativeFilePath) ? 0 : 60 * 60;

        await s3
          .upload(
            {
              Bucket: bucket,
              Key: key,
              Body: await readFile(f),
              ContentType: mime.lookup(f) || 'application/octet-stream',
              ContentEncoding: mime.charset(f) || 'identity',
              CacheControl: `public, max-age=${maxAge}`,
              ACL: 'public-read',
            },
            {
              queueSize: 10,
            }
          )
          .promise();
      }
    })
  );
}

export async function downloadFromS3(bucket: string, keyPrefix: string) {
  const s3 = new AWS.S3();

  const paths = await s3
    .listObjects({ Bucket: bucket, Prefix: keyPrefix })
    .promise();

  await Promise.all(
    (paths.Contents || []).map(async ({ Key }) => {
      const localPath = path.relative(keyPrefix, Key!);

      if (localPath === '') {
        return;
      }

      console.log(localPath);
      if (Key!.endsWith('/')) {
        try {
          await mkdir(localPath);
        } catch (err) {
          if (err.code !== 'EEXIST') {
            throw err;
          }
        }
      } else {
        const object = await s3
          .getObject({ Bucket: bucket, Key: Key! })
          .promise();

        await writeFile(localPath, object.Body);
      }
    })
  );
}
