

function check_jwt(config, authjwt) {

	if( authjwt['iss'] !== config['iss'] ) {
		console.log(`iss ${authjwt['iss']} mismatch with ${config['iss']}`);
		return false;
	}

	if( authjwt['aud'] !== config['aud'] ) {
		console.log(`aud ${authjwt['aud']} mismatch with ${config['aud']}`);
		return false;
	}

	const nbf = new Date(authjwt['nbf']);
	const exp = new Date(authjwt['exp']);
	const now = new Date();

	if( !! ( now > nbf && now < exp ) ) {
		console.log(`Time assertion fail ${nbf} > ${now} > ${exp}`);
		return false;
	}

	return true;
}


module.exports = check_jwt;