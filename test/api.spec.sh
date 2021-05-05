#! /bin/bash
#TODO: convert this to a proper mocha test

curl localhost:8080/config/index/run --header "Authorization: Bearer my_token_password"
