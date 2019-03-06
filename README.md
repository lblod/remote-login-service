# remote login service
this service is responsible for retrieving user information and linking it to a user session.

## configuration
Example docker-compose snippet (for usage with seas):
```
services:
  remotelogin:
    image: lblod/remotelogin
    environment:
      MU_APPLICATION_GRAPH: 'http://mu.semte.ch/graphs/public'
    volumes:
      - './config/remotelogin:/app/config'
```

Dispatcher.ex rules:
```
post "/remote-login/*path" do
  Proxy.forward conn, [], "http://remotelogin/remote-login"
end
```

An example config file is available in the config folder of this repository.

## usage
### request
```
    POST /remote-login HTTP/1.1
    Content-Type: application/vnd.api+json
    Accept: application/vnd.api+json

    {
      "data": {
          "type": "remote-login",
          "attributes": {
              "client-id": "1c5d34ca-4a76-456e-9cac-5c39fabeb90f",
              "user-token": "60f4b6be-bf44-442d-ad17-c0006e463f15"
          }
      }
    }
```
### response

#### 201 CREATED
```
    HTTP/1.1 201 Created
    Content-Type: application/vnd.api+json
    {
      "data": {
        "type": "remote-login",
        "id": "1c5d34ca-4a76-456e-9cac-5c39fabeb90f",
        "relationships": {
          "group": {
            "links": {
              "related": "/bestuurseenheden/${groupId}"
            },
            "data": {
              "type": "bestuurseenheden",
              "id": "${bestuurseenheidID}"
            }
          },
          "accounts": {
            "links": {
              "related": "/accounts/${accountI}"
            },
            "data": {
              "type": "accounts",
              "id": "${accountId}"
            }
          },
          "session": {
            "links": {
              "related": "/sessions/current"
            },
            "id": "${sessionID}"
          }
        }
      }
    }
```
#### 404 NOT FOUND

If a 404 was returned by the identity server (because no user could be
found for the specified user token), the remote login will also return a
404.
```
    HTTP/1.1 404 Not Found
    Content-Type: application/vnd.api+j
    { errors: ['error message'] }
```
#### 400 BAD REQUEST

If the request could not be processed correctly a 400 is returned
```
    HTTP/1.1 400 Bad Request
    Content-Type: application/vnd.api+json
    { errors: ['error message'] }
```
#### 502 BAD GATEWAY

If the identity endpoint does not respond or does not respond correctly
a 502 bad gateway is returned
```
    HTTP/1.1 502 Bad Gateway
    Content-Type: application/vnd.api+json
    { errors: ['error message'] }
```
#### 500 SERVER ERROR

In case of an unexpected error a 500 is returned
```
    HTTP/1.1 500 Server Error
    Content-Type: application/vnd.api+json
    { errors: ['error message'] }
```
