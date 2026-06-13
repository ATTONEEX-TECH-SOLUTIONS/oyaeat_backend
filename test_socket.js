require("dotenv").config();
const io = require("socket.io-client");
const jwt = require("jsonwebtoken");

// Generate fake token to test auth middleware
// Note: Normally we sign this with the REAL JWT_SECRET
const secret = process.env.JWT_SECRET || 'secret';
const fakeToken = jwt.sign({ id: 1, role: 'customer', email: 'test@test.com' }, secret, { expiresIn: '1h' });

const socket = io("http://localhost:5000", {
  auth: {
    token: fakeToken
  }
});

socket.on("connect", () => {
  console.log("Connected with socket id:", socket.id);
  
  socket.emit("join_thread", "test_thread_123");

  socket.on("receive_message", (msg) => {
    console.log("Received a message:", msg);
  });

  socket.on("broadcast", (data) => {
    console.log("Received a broadcast:", data);
  });

  setTimeout(() => {
    socket.disconnect();
    process.exit(0);
  }, 2000); // disconnect after 2s
});

socket.on("connect_error", (err) => {
  console.error("Connection failed:", err.message);
  process.exit(1);
});
