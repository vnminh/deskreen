let host;
let protocol;
let port;

if (!host && !protocol && !port) {
	host = window.location.host.split(':')[0];
	protocol = 'http';
	port = window.location.port || '3131';
}

export default {
	host,
	port,
	protocol,
};
