const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");

let io;

function initSocket(server) {
  io = socketIo(server, {
    cors: {
      origin: "*", // Restrict this in production if needed
      methods: ["GET", "POST"]
    }
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.token;
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded; // { id, role, email, etc. }
      next();
    } catch (error) {
      next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`Socket user connected: ${socket.user.id} (${socket.user.role})`);

    // Standard rooms for targeting notifications
    socket.join(`user_${socket.user.id}`);
    socket.join(`role_${socket.user.role}`);

    socket.on("join_thread", (threadId) => {
      socket.join(`thread_${threadId}`);
      console.log(`User ${socket.user.id} joined thread ${threadId}`);
    });

    socket.on("leave_thread", (threadId) => {
      socket.leave(`thread_${threadId}`);
      console.log(`User ${socket.user.id} left thread ${threadId}`);
    });

    socket.on("disconnect", () => {
      console.log(`Socket user disconnected: ${socket.user.id}`);
    });
  });

  return io;
}

function getIo() {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
}

module.exports = initSocket;
module.exports.getIo = getIo;
