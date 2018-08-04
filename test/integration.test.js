import path from 'path';
import test from 'ava';
import {writeJson, appendFile} from 'fs-extra';
import execa from 'execa';
import got from 'got';
import tempy from 'tempy';
import npmRegistry from './helpers/run-docker-image';

/* eslint camelcase: ["error", {properties: "never"}] */

const COUCHDB_USER = 'admin';
const COUCHDB_PASSWORD = 'password';
const NPM_USERNAME = 'integration';
const NPM_PASSWORD = 'suchsecure';
const NPM_EMAIL = 'integration@test.com';

const env = {
  ...process.env,
  npm_config_registry: npmRegistry.url,
};

test.before(async () => {
  await npmRegistry.start({COUCHDB_USER, COUCHDB_PASSWORD});
});

test.after.always(async () => {
  await npmRegistry.stop();
});

test('Create npm user and publish a package', async t => {
  const name = 'test-package';
  let version = '1.0.0';
  const cwd = tempy.directory();

  t.log('Create npm user');
  await got(`${npmRegistry.baseUrl}/_users/org.couchdb.user:${NPM_USERNAME}`, {
    json: true,
    auth: `${COUCHDB_USER}:${COUCHDB_PASSWORD}`,
    method: 'PUT',
    body: {
      _id: `org.couchdb.user:${NPM_USERNAME}`,
      name: NPM_USERNAME,
      roles: [],
      type: 'user',
      password: NPM_PASSWORD,
      email: NPM_EMAIL,
    },
  });

  t.log('Verify user');
  await appendFile(
    path.resolve(cwd, '.npmrc'),
    `_auth = ${Buffer.from(`${NPM_USERNAME}:${NPM_PASSWORD}`, 'utf8').toString('base64')}
email = ${NPM_EMAIL}
registry = ${npmRegistry.url}
`
  );
  t.is(await execa.stdout('npm', ['whoami'], {cwd, env}), NPM_USERNAME);

  t.log('Publish package');
  await writeJson(path.resolve(cwd, 'package.json'), {name, version});
  let {code} = await execa('npm', ['publish'], {cwd, env});
  t.is(code, 0);
  t.is(await execa.stdout('npm', ['view', name, 'version'], {cwd, env}), version);

  t.log('Publish on @next');
  version = '1.1.0';
  await execa.stdout('npm', ['version', version], {cwd, env});
  ({code} = await execa('npm', ['publish', '--tag', 'next'], {cwd, env}));
  t.is(code, 0);
  t.is(await execa.stdout('npm', ['view', name, 'dist-tags.next'], {cwd, env}), version);

  t.log('Add to @latest');
  ({code} = await execa('npm', ['dist-tag', 'add', `${name}@${version}`, 'latest'], {cwd, env}));
  t.is(code, 0);
  t.is(await execa.stdout('npm', ['view', name, 'dist-tags.latest'], {cwd, env}), version);
});