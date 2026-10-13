const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io = null;

/**
 * Initializes the Socket.io server instance bound to your HTTP server
 * @param {object} httpServer - The native node HTTP server object from index.js
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*", // Adjust this to match your specific Next.js production domains later
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
    }
  });

  // Authentication Middleware: Safely decodes JWTs before permitting open streams
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("Socket connection rejected: Missing authorization token."));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded; // Attaches user sub-properties (id, role, email) straight to socket session
      next();
    } catch (err) {
      return next(new Error("Socket connection rejected: Expired or invalid token signature."));
    }
  });

  io.on("connection", (socket) => {
    const { id: userId, role } = socket.user;
    console.log(`🔌 Live WebSocket Connected: User #${userId} mapped with role [${role}]`);

    // Channel Segmentation: Place riders inside their own distinct private signaling room
    if (role === "rider") {
      socket.join(`rider_${userId}`);
      console.log(`🏍️ Rider #${userId} joined private dispatch network room: [rider_${userId}]`);
    }

    // Channel Segmentation: Place admins inside a global monitor tracking room
    if (role === "admin" || role === "owner") {
      socket.join("admin_operations_room");
      console.log(`👑 Administrative observer joined central grid control room.`);
    }

    socket.on("disconnect", () => {
      console.log(`❌ WebSocket Disconnected: User #${userId} dropped stream connection.`);
    });
  });

  return io;
};

/**
 * Global Getter Utility: Grabs the running instance from anywhere inside your controller code
 */
const getIO = () => {
  if (!io) {
    throw new Error("Socket.io engine has not been initialized yet.");
  }
  return io;
};

module.exports = { initSocket, getIO, getIo: getIO };
