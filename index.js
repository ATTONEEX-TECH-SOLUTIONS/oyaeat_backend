// Prefer IPv4 when resolving hosts: some networks drop IPv6 TLS connections (seen with api.paystack.co)
require("dns").setDefaultResultOrder("ipv4first");

const http = require("http");
const app = require("./src/app");
const { initSocket } = require("./src/socket/init");

const server = http.createServer(app);

// Initialize shared Socket.IO instance
initSocket(server);

server.listen(5000, () => {
  console.log("Server running on port 5000");
});
