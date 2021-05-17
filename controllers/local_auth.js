const fs = require('fs-extra');
const path = require('path');

function verifyToken(req, res, next) {
  const bearerHeader = req.headers['authorization'];

  if (bearerHeader) {
    const bearer = bearerHeader.split(' ');
    const bearerToken = bearer[1];
    req.token = bearerToken;
    next();
  } else {
    // Forbidden
    res.status(403).json({error: 'not authorized'});
  }
}

// TODO: this is simple silliness, just to prove a point :)
async function simpleVerify(api, token) {
  if (api.enabled) {
    return api.token === token;
  } else {
    return false
  }
}

module.exports = {verifyToken, simpleVerify};
