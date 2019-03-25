import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import { app, uuid, errorHandler } from 'mu';
import yaml from 'js-yaml';
import fs from 'fs';
import needle from 'needle';
import { removeOldSessions, ensureUserAndAccount, insertNewSessionForAccount, selectBestuurseenheid } from './lib/session';

function get(obj, path) {
  const keys = path.split('.');
  var o = obj;
  for (const key of keys) {
    if (o.hasOwnProperty(key))
      o = o[key];
    else {
      return null;
    }
  }
  return o;
}
function parseRequestBody(req) {
  const errors = [];
  if (! req.headers['mu-session-id'])
    errors.push('session header is missing');
  if (! req.headers['content-type'] || ! req.headers['content-type'].startsWith('application/vnd.api+json') )
    errors.push('invalid content-type: ' + req.headers['content-type']);
  var body = req.body;
  if (! body.data || ! body.data.attributes || ! body.data.attributes["client-id"] || ! body.data.attributes["user-token"])
    errors.push('invalid request body');
  const clientId = body.data.attributes["client-id"];
  const userToken = body.data.attributes["user-token"];
  return {clientId,userToken, errors};
}

async function fetchIdentity(endpoint, userToken) {
  const tokenParam = endpoint.includes('?') ? `&user-token=${userToken}` : `?user-token=${userToken}`;
  const resp = await needle('get',`${endpoint}${tokenParam}`);
  return resp;
}

function getEndpointForClientId(clientId) {
  const config = yaml.safeLoad(fs.readFileSync('/app/config/clients.yml', 'utf8'));
  const client = config.clients.find((c) => c.id === clientId);
  if (client)
    return client.endpoint;
  else
    return null;
}

async function linkSessionToUser(body, sessionUri) {
  await removeOldSessions(sessionUri);
  const claims = {};
  claims.id = get(body, 'data.id');
  claims.given_name = get(body, 'data.attributes.given-name');
  claims.family_name = get(body,'data.attributes.family-name');
  claims.identifier = get(body, 'data.attributes.identifier');
  const groupId = get(body, 'relationships.group.data.id');
  const { accountUri, accountId } = await ensureUserAndAccount(claims, groupId);
  const groupUri = await selectBestuurseenheid(groupId);
  if (!groupUri)
    throw "bestuurseenheid not found";
  const { sessionId } = await insertNewSessionForAccount(accountUri, sessionUri, groupUri);
  return { groupId, accountId, sessionId};
}
app.post('/remote-login', async function( req, res ) {
  const {clientId, userToken, errors} = parseRequestBody(req);
  if (errors.length > 0) {
    res.status(400).send({errors: errors}).end();
    return;
  }

  const endpoint = await getEndpointForClientId(clientId);
  if (!endpoint) {
    res.status(400).send({errors: ['invalid client-id']}).end();
    return;
  }
  const identityResponse = await fetchIdentity(endpoint, userToken);
  if (identityResponse.statusCode === 404) {
    res.status(404).send({errors: ['error 404 returned by gateway']});
  }
  else if (identityResponse.statusCode === 200) {
    try {
      const body = JSON.parse(identityResponse.body);
      const sessionUri = req.headers['mu-session-id'];
      const { groupId, accountId, sessionId} = await linkSessionToUser(body, sessionUri);
      res.status(201).send(
        {
          "data": {
            "type": "remote-login",
            "id": uuid(),
            "relationships": {
              "group": {
                "links": {
                  "related": `/bestuurseenheden/${groupId}`
                },
                "data": {
                  "type": "bestuurseenheden",
                  "id": groupId
                }
              },
              "account": {
                "links": {
                  "related": `/accounts/${accountId}`
                },
                "data": {
                  "type": "accounts",
                  "id": accountId
                }
              },
              "session": {
                "links": {
                  "related": "/sessions/current"
                },
                "id": sessionId
              }
            }
          }
        }
      );
    }
    catch(e) {
      console.log(e);
      res.status(500).send({errors: ['error occured during processing:' + e]});
    }
  }
  else {
    console.log(identityResponse.statusCode);
    res.status(502).send({errors: ['failed to fetch identity from endpoint']});
  }
} );

app.use(errorHandler); 
