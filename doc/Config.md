# Configuration

To run the application

```shell
node ./bin/www ./config/express.json
```

The start configuration is located in express.json file

session:
```shell
"secret": "change me to a real secret",
"name": "session",
"expiry": 24,
"server": "memcached:11211"
```

auth with AAF
```shell
"sessionSecret": "xxx",
"jwtSecret": "xxxx",
"authURL": "https://rapid.test.aaf.edu.au/jwt/authnrequest/research/XXX",
"iss": "https://rapid.test.aaf.edu.au",
"aud": "http://localhost:8080",
"attributes": "https://aaf.edu.au/attributes",
"allow": {
    "uid": "uts.edu.au",
    "affiliation": "^staff@uts.edu.au$"
}
```
or run in unsafe_mode
```shell
"UNSAFE_MODE": true

```
Enable CORS access:
```shell
"cors": true,
```

Pointer to solr server:
```shell
"solr": "http://solr:8983",

```
Robot block plugins:

This will block access to these defined bots. 
You may need to disable this in AWS for example if you are using a load balancer
```shell
"clientBlock": [ "isIE", "isBot" ],

```

Solr Fields:

If this is not present the indexer will store all elements
```shell
"solr_fl": [
  "id",
  "description"
]
```

Pointers to portal and indexer configuration
```shell
"portal": "/etc/share/config/portal.json",
"indexer": "/etc/share/config/indexer.json",
```

API:

To Run the indexer you can index via the API if it is enabled in express.json config

```shell
curl localhost:8080/config/index/run --header "Authorization: Bearer my_token_password"
```

If disabled, to index run `node app_index.run.js`
```shell
"api": {
  "enabled": true,
  "token": "my_token_password"
}
```
